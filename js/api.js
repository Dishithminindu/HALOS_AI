/**
 * HALOS v2 Cloudflare D1 Bridge
 */
const API_BASE = ""; // Relative URL points directly to Cloudflare Worker host

const API = {
  // 1. Create anonymized participant record in D1
  async createParticipant(formData) {
    const res = await fetch(`${API_BASE}/api/participants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData)
    });
    return res.json();
  },

  // 2. Save 24h Recall list to D1
  async saveRecall(participantId, items) {
    const res = await fetch(`${API_BASE}/api/recalls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId, items })
    });
    return res.json();
  },

  // 3. Save Monthly habits & trigger Random Forest inference
  async runPrediction(participantId, questionnaireData) {
    const res = await fetch(`${API_BASE}/api/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId, ...questionnaireData })
    });
    return res.json();
  },

  // 4. Fetch all records for the Research Dashboard
  async getDashboardData() {
    const res = await fetch(`${API_BASE}/api/participants`);
    return res.json();
  },

  // 5. Trigger CSV download directly from D1 stream
  exportCSV() {
    window.location.href = `${API_BASE}/api/export`;
  }
};