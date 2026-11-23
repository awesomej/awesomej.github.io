import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { personaNames, personaPrompts } from "./observability/personas.js";

const ANAM_SESSION_URL = "https://api.anam.ai/v1/auth/session-token";
const rootDirectory = fileURLToPath(new URL(".", import.meta.url));

function readJsonBody(request) {
    return new Promise((resolve, reject) => {
        let body = "";
        request.on("data", chunk => { body += chunk; });
        request.on("end", () => {
            try { resolve(JSON.parse(body || "{}")); }
            catch (error) { reject(error); }
        });
        request.on("error", reject);
    });
}

function sendJson(response, status, payload) {
    response.statusCode = status;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(payload));
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "ANAM_");

    return {
        build: {
            rollupOptions: {
                input: {
                    home: resolve(rootDirectory, "index.html"),
                    observability: resolve(rootDirectory, "observability/index.html"),
                    peculiarIncident: resolve(rootDirectory, "a-most-peculiar-incident/index.html")
                }
            }
        },
        plugins: [{
            name: "local-anam-session-endpoint",
            configureServer(server) {
                server.middlewares.use("/api/anam-session", async (request, response) => {
                    if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });

                    try {
                        const { persona } = await readJsonBody(request);
                        if (!personaPrompts[persona]) return sendJson(response, 400, { error: "Unknown persona" });

                        const role = persona.toUpperCase();
                        const avatarId = env[`ANAM_${role}_AVATAR_ID`] || env.ANAM_AVATAR_ID;
                        const voiceId = env[`ANAM_${role}_VOICE_ID`] || env.ANAM_VOICE_ID;
                        const missing = ["ANAM_API_KEY", "ANAM_LLM_ID"].filter(key => !env[key]);
                        if (!avatarId) missing.push("ANAM_AVATAR_ID");
                        if (!voiceId) missing.push("ANAM_VOICE_ID");
                        if (missing.length) return sendJson(response, 500, { error: `Missing ${missing.join(", ")} in .env.local` });

                        const anamResponse = await fetch(ANAM_SESSION_URL, {
                            method: "POST",
                            headers: {
                                "Authorization": `Bearer ${env.ANAM_API_KEY}`,
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                personaConfig: {
                                    name: personaNames[persona],
                                    avatarId,
                                    voiceId,
                                    llmId: env.ANAM_LLM_ID,
                                    systemPrompt: personaPrompts[persona]
                                }
                            })
                        });

                        const payload = await anamResponse.json().catch(() => ({}));
                        if (!anamResponse.ok) {
                            console.error("Anam session creation failed", anamResponse.status, payload);
                            return sendJson(response, anamResponse.status, { error: payload.message || payload.error || "Anam session creation failed" });
                        }
                        return sendJson(response, 200, { sessionToken: payload.sessionToken });
                    } catch (error) {
                        console.error("Local Anam endpoint failed", error);
                        return sendJson(response, 500, { error: "Unable to create the Anam session" });
                    }
                });
            }
        }]
    };
});
