/**
 * HALOS Cloudflare Worker
 *
 * - Serves the static frontend from the Workers Static Assets binding.
 * - Keeps API routes behind optional Basic Auth configured with secrets.
 * - D1 is optional at deploy time; API routes return a clear 503 if DB is not bound.
 *
 * Set secrets for API protection:
 *   npx wrangler secret put ADMIN_USER
 *   npx wrangler secret put ADMIN_PASS
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS is only relevant to API routes.
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (path.startsWith("/api/")) {
      if (method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      const authError = requireAdminAuth(request, env);
      if (authError) return authError;

      if (!env.DB) {
        return jsonResponse(
          {
            error: "Database not configured",
            message:
              "The static HALOS site is deployed, but the D1 database binding is not configured. Add a D1 binding named DB before using the API.",
          },
          503,
          corsHeaders
        );
      }

      try {
        // 1. Participant Registration
        if (path === "/api/participants" && method === "POST") {
          const body = await request.json();
          const { studyId, age, sex, height, weight, group } = body;

          if (!studyId || !Number.isFinite(Number(age)) || !Number.isFinite(Number(height)) || !Number.isFinite(Number(weight))) {
            return jsonResponse({ error: "Invalid participant data" }, 400, corsHeaders);
          }

          const id = crypto.randomUUID();
          await env.DB.prepare(
            `INSERT INTO participants
              (id, study_id, age, sex, height, weight, study_group)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
            .bind(
              id,
              String(studyId).trim(),
              parseInt(age, 10),
              sex || null,
              parseFloat(height),
              parseFloat(weight),
              group || "Control"
            )
            .run();

          return jsonResponse({ success: true, id, studyId }, 201, corsHeaders);
        }

        // 2. Fetch participants
        if (path === "/api/participants" && method === "GET") {
          const { results } = await env.DB.prepare(
            `SELECT p.*, pr.estimated_salt_g, pr.risk_level, pr.prediction_confidence
             FROM participants p
             LEFT JOIN predictions pr ON p.id = pr.participant_id
             ORDER BY p.created_at DESC`
          ).all();

          return jsonResponse({ success: true, participants: results }, 200, corsHeaders);
        }

        // 3. Save 24-hour recall
        if (path === "/api/recalls" && method === "POST") {
          const { participantId, items } = await request.json();

          if (!participantId || !Array.isArray(items)) {
            return jsonResponse({ error: "participantId and items are required" }, 400, corsHeaders);
          }

          const statements = items.map((item) =>
            env.DB.prepare(
              `INSERT INTO dietary_recalls
                (id, participant_id, meal_type, food_name, portion_g, sodium_mg)
               VALUES (?, ?, ?, ?, ?, ?)`
            ).bind(
              crypto.randomUUID(),
              participantId,
              item.meal ?? item.meal_type ?? null,
              item.food ?? item.food_name ?? null,
              parseFloat(item.portion ?? item.portion_g ?? 0),
              parseFloat(item.sodium ?? item.sodium_mg ?? 0)
            )
          );

          if (statements.length) await env.DB.batch(statements);
          return jsonResponse({ success: true, message: "Recall entries saved" }, 201, corsHeaders);
        }

        // 4. Save monthly habits and calculate demonstration prediction
        if (path === "/api/predict" && method === "POST") {
          const body = await request.json();
          const { participantId, snacks, processedMeat, tableSalt, sauces } = body;

          if (!participantId) {
            return jsonResponse({ error: "participantId is required" }, 400, corsHeaders);
          }

          await env.DB.prepare(
            `INSERT INTO monthly_questionnaires
              (id, participant_id, salty_snacks_freq, processed_meat_freq, added_table_salt, sauce_consumption)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
            .bind(
              crypto.randomUUID(),
              participantId,
              snacks ?? null,
              processedMeat ?? null,
              tableSalt ?? null,
              sauces ?? null
            )
            .run();

          const recallSum = await env.DB.prepare(
            `SELECT SUM(sodium_mg) AS total_sodium
             FROM dietary_recalls
             WHERE participant_id = ?`
          )
            .bind(participantId)
            .first();

          const totalSodium = Number(recallSum?.total_sodium || 0);

          const snackScore = snacks === "Daily" ? 500 : snacks === "Weekly" ? 200 : 50;
          const saltScore = tableSalt === "High" ? 600 : tableSalt === "Moderate" ? 250 : 0;
          const estimatedSodium = totalSodium + snackScore + saltScore;
          const estimatedSalt = Number((estimatedSodium / 393.4).toFixed(2));

          let riskLevel = "LOW";
          if (estimatedSalt > 5 && estimatedSalt <= 8) riskLevel = "MODERATE";
          else if (estimatedSalt > 8 && estimatedSalt <= 11) riskLevel = "HIGH";
          else if (estimatedSalt > 11) riskLevel = "CRITICAL";

          // Demonstration only: deterministic instead of Math.random().
          const confidence = 85;

          await env.DB.prepare(
            `INSERT INTO predictions
              (id, participant_id, total_sodium_mg, estimated_salt_g, risk_level, prediction_confidence)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
            .bind(
              crypto.randomUUID(),
              participantId,
              estimatedSodium,
              estimatedSalt,
              riskLevel,
              confidence
            )
            .run();

          return jsonResponse(
            {
              success: true,
              prediction: {
                estimatedSodium,
                estimatedSalt,
                riskLevel,
                confidence,
              },
            },
            200,
            corsHeaders
          );
        }

        // 5. Research CSV export
        if (path === "/api/export" && method === "GET") {
          const { results } = await env.DB.prepare(
            `SELECT p.study_id, p.age, p.sex, p.height, p.weight, p.study_group,
                    pr.total_sodium_mg, pr.estimated_salt_g, pr.risk_level,
                    pr.prediction_confidence, pr.created_at
             FROM participants p
             JOIN predictions pr ON p.id = pr.participant_id`
          ).all();

          const escapeCsv = (value) => {
            const text = value == null ? "" : String(value);
            return `"${text.replaceAll('"', '""')}"`;
          };

          const header = [
            "Study_ID", "Age", "Sex", "Height_cm", "Weight_kg", "Group",
            "Sodium_mg", "Salt_g", "Risk_Level", "Confidence_Pct", "Date"
          ];

          const lines = [
            header.map(escapeCsv).join(","),
            ...results.map((r) =>
              [
                r.study_id, r.age, r.sex, r.height, r.weight, r.study_group,
                r.total_sodium_mg, r.estimated_salt_g, r.risk_level,
                r.prediction_confidence, r.created_at
              ].map(escapeCsv).join(",")
            ),
          ];

          return new Response(lines.join("\r\n") + "\r\n", {
            headers: {
              ...corsHeaders,
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": 'attachment; filename="halos_research_dataset.csv"',
            },
          });
        }

        return jsonResponse({ error: "Endpoint Not Found" }, 404, corsHeaders);
      } catch (err) {
        console.error(err);
        return jsonResponse(
          { error: "Internal server error" },
          500,
          corsHeaders
        );
      }
    }

    // Static frontend: no Basic Auth challenge, so CSS/JS/images/pages can load.
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("HALOS assets are not configured.", { status: 500 });
  },
};

function requireAdminAuth(request, env) {
  const expectedUser = env.ADMIN_USER;
  const expectedPass = env.ADMIN_PASS;

  if (!expectedUser || !expectedPass) {
    return jsonResponse(
      {
        error: "API authentication is not configured",
        message: "Set ADMIN_USER and ADMIN_PASS as Worker secrets before using the API.",
      },
      503,
      { "Content-Type": "application/json" }
    );
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Basic ")) {
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="HALOS API"',
      },
    });
  }

  try {
    const decoded = atob(authHeader.slice(6));
    const separator = decoded.indexOf(":");
    const user = separator >= 0 ? decoded.slice(0, separator) : decoded;
    const pass = separator >= 0 ? decoded.slice(separator + 1) : "";

    if (user !== expectedUser || pass !== expectedPass) {
      return new Response("Unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="HALOS API"',
        },
      });
    }
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  return null;
}

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
