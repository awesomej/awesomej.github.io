import { personaNames, personaPrompts } from "../personas.js";

const ANAM_SESSION_URL = "https://api.anam.ai/v1/auth/session-token";

function cors(origin, allowedOrigin) {
    return {
        "Access-Control-Allow-Origin": allowedOrigin === "*" ? "*" : origin,
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin"
    };
}

export default {
    async fetch(request, env) {
        const origin = request.headers.get("Origin") || "";
        const allowedOrigin = env.ALLOWED_ORIGIN || "";
        const headers = cors(origin, allowedOrigin);
        if (request.method === "OPTIONS") return new Response(null, { headers });
        if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers });
        if (allowedOrigin !== "*" && origin !== allowedOrigin) return Response.json({ error: "Origin not allowed" }, { status: 403, headers });

        const { persona } = await request.json();
        if (!personaPrompts[persona]) return Response.json({ error: "Unknown persona" }, { status: 400, headers });

        const role = persona.toUpperCase();
        const avatarId = env[`ANAM_${role}_AVATAR_ID`] || env.ANAM_AVATAR_ID;
        const voiceId = env[`ANAM_${role}_VOICE_ID`] || env.ANAM_VOICE_ID;
        if (!env.ANAM_API_KEY || !env.ANAM_LLM_ID || !avatarId || !voiceId) {
            return Response.json({ error: `Anam environment is incomplete for ${persona}` }, { status: 500, headers });
        }

        const response = await fetch(ANAM_SESSION_URL, {
            method: "POST",
            headers: { "Authorization": `Bearer ${env.ANAM_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ personaConfig: { name: personaNames[persona], avatarId, voiceId, llmId: env.ANAM_LLM_ID, systemPrompt: personaPrompts[persona] } })
        });
        if (!response.ok) return Response.json({ error: "Anam session creation failed" }, { status: response.status, headers });
        const { sessionToken } = await response.json();
        return Response.json({ sessionToken }, { headers });
    }
};
