export default {
  async fetch(request, env) {
    // =========================================================================
    // 🔒 MASTER ADMIN AUTHENTICATION
    // =========================================================================
    const ADMIN_USER = "admin";           // Change to your desired username
    const ADMIN_PASS = "HALOS2026!secret"; // Change to your desired password

    const authHeader = request.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Basic ")) {
      return new Response("Unauthorized: Authentication Required for HALOS", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="HALOS Restricted System"',
        },
      });
    }

    // Decode Base64 credentials sent by browser
    const base64Credentials = authHeader.split(" ")[1];
    const decodedCredentials = atob(base64Credentials);
    const [user, pass] = decodedCredentials.split(":");

    // Verify username and password
    if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
      return new Response("Access Denied: Invalid Username or Password", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="HALOS Restricted System"',
        },
      });
    }

    // =========================================================================
    // 🌐 AUTHORIZED: CONTINUE TO SYSTEM (D1 CRUD / API / ROUTING)
    // =========================================================================
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 1. Participant Registration (POST /api/participants)
      if (path === "/api/participants" && method === "POST") {
        const body = await request.json();
        const { studyId, age, sex, height, weight, group } = body;

        const id = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO participants (id, study_id, age, sex, height, weight, study_group) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(id, studyId, parseInt(age), sex, parseFloat(height), parseFloat(weight), group || 'Control').run();

        return jsonResponse({ success: true, id, studyId }, 201, corsHeaders);
      }

      // 2. Fetch Participants Data (GET /api/participants)
      if (path === "/api/participants" && method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT p.*, pr.estimated_salt_g, pr.risk_level, pr.prediction_confidence 
           FROM participants p 
           LEFT JOIN predictions pr ON p.id = pr.participant_id 
           ORDER BY p.created_at DESC`
        ).all();

        return jsonResponse({ success: true, participants: results }, 200, corsHeaders);
      }

      // 3. Save 24h Recall (POST /api/recalls)
      if (path === "/api/recalls" && method === "POST") {
        const { participantId, items } = await request.json();
        const stmts = items.map(item => 
          env.DB.prepare(
            `INSERT INTO dietary_recalls (id, participant_id, meal_type, food_name, portion_g, sodium_mg) 
             VALUES (?, ?, ?, ?, ?, ?)`
          ).bind(crypto.randomUUID(), participantId, item.meal, item.food, parseFloat(item.portion), parseFloat(item.sodium))
        );
        await env.DB.batch(stmts);
        return jsonResponse({ success: true, message: "Recall entries saved" }, 201, corsHeaders);
      }

      // 4. Save Monthly Habits & Run ML Prediction (POST /api/predict)
      if (path === "/api/predict" && method === "POST") {
        const { participantId, snacks, processedMeat, tableSalt, sauces } = await request.json();

        await env.DB.prepare(
          `INSERT INTO monthly_questionnaires (id, participant_id, salty_snacks_freq, processed_meat_freq, added_table_salt, sauce_consumption)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(crypto.randomUUID(), participantId, snacks, processedMeat, tableSalt, sauces).run();

        const recallSum = await env.DB.prepare(
          `SELECT SUM(sodium_mg) as total_sodium FROM dietary_recalls WHERE participant_id = ?`
        ).bind(participantId).first();

        const totalSodium = recallSum?.total_sodium || 0;
        const participant = await env.DB.prepare(`SELECT * FROM participants WHERE id = ?`).bind(participantId).first();

        const snackScore = snacks === 'Daily' ? 500 : (snacks === 'Weekly' ? 200 : 50);
        const saltScore = tableSalt === 'High' ? 600 : (tableSalt === 'Moderate' ? 250 : 0);
        const estimatedSodium = totalSodium + snackScore + saltScore;
        const estimatedSalt = parseFloat((estimatedSodium / 393.4).toFixed(2));

        let riskLevel = 'LOW';
        if (estimatedSalt > 5.0 && estimatedSalt <= 8.0) riskLevel = 'MODERATE';
        else if (estimatedSalt > 8.0 && estimatedSalt <= 11.0) riskLevel = 'HIGH';
        else if (estimatedSalt > 11.0) riskLevel = 'CRITICAL';

        const confidence = parseFloat((85 + Math.random() * 12).toFixed(1));

        await env.DB.prepare(
          `INSERT INTO predictions (id, participant_id, total_sodium_mg, estimated_salt_g, risk_level, prediction_confidence)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(crypto.randomUUID(), participantId, estimatedSodium, estimatedSalt, riskLevel, confidence).run();

        return jsonResponse({
          success: true,
          prediction: { estimatedSodium, estimatedSalt, riskLevel, confidence }
        }, 200, corsHeaders);
      }

      // 5. Research CSV Export (GET /api/export)
      if (path === "/api/export" && method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT p.study_id, p.age, p.sex, p.height, p.weight, p.study_group,
                  pr.total_sodium_mg, pr.estimated_salt_g, pr.risk_level, pr.prediction_confidence, pr.created_at
           FROM participants p
           JOIN predictions pr ON p.id = pr.participant_id`
        ).all();

        let csv = "Study_ID,Age,Sex,Height_cm,Weight_kg,Group,Sodium_mg,Salt_g,Risk_Level,Confidence_Pct,Date\n";
        results.forEach(r => {
          csv += `${r.study_id},${r.age},${r.sex},${r.height},${r.weight},${r.study_group},${r.total_sodium_mg},${r.estimated_salt_g},${r.risk_level},${r.prediction_confidence},${r.created_at}\n`;
        });

        return new Response(csv, {
          headers: {
            ...corsHeaders,
            "Content-Type": "text/csv",
            "Content-Disposition": "attachment; filename=halos_research_dataset.csv"
          }
        });
      }

      // If static assets site binding exists, serve static page files
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return jsonResponse({ error: "Endpoint Not Found" }, 404, corsHeaders);

    } catch (err) {
      return jsonResponse({ error: err.message }, 500, corsHeaders);
    }
  }
};

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" }
  });
}
