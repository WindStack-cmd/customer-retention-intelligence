export const demoOverview = {
  metadata: {
    dataset: "Synthetic demo layer based on public Telco Customer Churn schema",
    dataStatus: "SIMULATED",
    generatedAt: "2026-09-12T09:30:00.000Z",
    predictionHorizon: "30 days",
  },
  summary: {
    activeCustomers: 12842,
    activeCustomersDelta: 8.6,
    revenueAtRisk: 1840000,
    revenueAtRiskDelta: -4.2,
    saveableRevenue: 612000,
    saveableRevenueDelta: 11.8,
    modelRecall: 78.4,
    modelRecallDelta: 2.1,
  },
  trend: {
    labels: ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"],
    atRisk: [1020, 1104, 978, 1212, 1150, 1280, 1196, 1388, 1324, 1456, 1392, 1488],
    revenue: [1.22, 1.31, 1.18, 1.42, 1.36, 1.54, 1.48, 1.68, 1.59, 1.78, 1.69, 1.84],
  },
  customers: [
    { id: "cus_10482", name: "Maya Patel", company: "Northstar Labs", initials: "MP", segment: "Enterprise", plan: "Scale", risk: 92, revenue: 28400, ltv: 182000, reason: "Usage down 41%", action: "Executive check-in", lastSeen: "2h ago", status: "Urgent" },
    { id: "cus_10219", name: "Jon Bell", company: "Brightline Health", initials: "JB", segment: "Mid-market", plan: "Growth", risk: 87, revenue: 14800, ltv: 96400, reason: "3 failed payments", action: "Billing recovery", lastSeen: "5h ago", status: "Urgent" },
    { id: "cus_09874", name: "Sofia Chen", company: "Aperture Finance", initials: "SC", segment: "Enterprise", plan: "Scale", risk: 81, revenue: 22300, ltv: 141800, reason: "Support sentiment", action: "Support escalation", lastSeen: "Yesterday", status: "High" },
    { id: "cus_11602", name: "Liam Williams", company: "Harbor & Co.", initials: "LW", segment: "Mid-market", plan: "Growth", risk: 76, revenue: 9600, ltv: 57800, reason: "Login frequency", action: "Adoption campaign", lastSeen: "Yesterday", status: "High" },
    { id: "cus_10931", name: "Ava Thompson", company: "Vertex Creative", initials: "AT", segment: "SMB", plan: "Starter", risk: 68, revenue: 4200, ltv: 24600, reason: "Contract renewal", action: "Renewal offer", lastSeen: "2d ago", status: "Monitor" },
    { id: "cus_08743", name: "Noah Garcia", company: "Cedar Systems", initials: "NG", segment: "SMB", plan: "Starter", risk: 63, revenue: 3800, ltv: 21300, reason: "Feature adoption", action: "Product education", lastSeen: "2d ago", status: "Monitor" },
  ],
  segments: [
    { name: "Enterprise", customers: 1830, share: 14, risk: 72, revenue: 920000, color: "mint" },
    { name: "Mid-market", customers: 4210, share: 33, risk: 58, revenue: 604000, color: "blue" },
    { name: "SMB", customers: 6802, share: 53, risk: 41, revenue: 316000, color: "amber" },
  ],
  activity: [
    { type: "model", title: "Weekly scoring completed", detail: "12,842 customers evaluated", time: "18 min ago", icon: "model" },
    { type: "action", title: "Retention playbook launched", detail: "42 enterprise accounts queued", time: "1h ago", icon: "action" },
    { type: "data", title: "Usage events synced", detail: "3,108 new events ingested", time: "2h ago", icon: "data" },
  ],
} as const;

export type DemoOverview = typeof demoOverview;
