import { useState, useEffect, useRef } from "react";

const EXAMPLES = [
  "Build a CRM with contacts, deals, role-based access (admin/sales), and premium analytics.",
  "Build a personal habit tracker with daily check-ins, streaks, and a premium reminders plan.",
  "Build a support ticket app: users file tickets, admins triage and update status.",
  "Build an inventory management system with products, stock levels, suppliers, and low-stock alerts.",
];

const FEATURE_CARDS = [
  {
    icon: "⚡",
    title: "Instant compilation",
    desc: "Describe your app in plain English. Synthesize parses it into a strict JSON spec in seconds.",
  },
  {
    icon: "🗄️",
    title: "Schema inference",
    desc: "Tables, columns, types, and seed data are inferred automatically from your description.",
  },
  {
    icon: "🔐",
    title: "Auth & roles built-in",
    desc: "Role-based access, plans, and gated pages are first-class — no extra configuration.",
  },
  {
    icon: "▶️",
    title: "Live runtime preview",
    desc: "A fully interactive app preview runs directly in your browser — no deployment needed.",
  },
  {
    icon: "🔍",
    title: "Lint & validation",
    desc: "Every spec passes a multi-pass compiler with schema validation and semantic lint.",
  },
  {
    icon: "📦",
    title: "Export your spec",
    desc: "Download the JSON spec and use it with any renderer or backend you choose.",
  },
];

const SHOWCASE = [
  { label: "CRM", prompt: "Build a CRM with contacts, deals pipeline, and role-based access." },
  { label: "Habit Tracker", prompt: "Build a habit tracker with streaks and premium reminders." },
  { label: "Support Desk", prompt: "Build a support ticket system with admin triage." },
  { label: "Inventory", prompt: "Build an inventory system with products and suppliers." },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function humanize(s) {
  return s.replace(/[_-]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function singular(s) {
  return s.endsWith("s") ? s.slice(0, -1) : s;
}

function passDefaults(spec) {
  const out = JSON.parse(JSON.stringify(spec));
  if (!out.plans || !out.plans.length) out.plans = ["free", "premium"];
  if (!Array.isArray(out.roles) || !out.roles.length) out.roles = ["user"];
  if (!out.roles.includes("user")) out.roles.push("user");
  if (!Array.isArray(out.tables)) out.tables = [];
  if (!Array.isArray(out.pages)) out.pages = [];
  for (const t of out.tables) {
    if (!t.label) t.label = humanize(t.name);
    if (!Array.isArray(t.columns)) t.columns = [];
    if (!Array.isArray(t.seed)) t.seed = [];
  }
  if (!out.nav || !out.nav.length) {
    out.nav = out.pages
      .filter((p) => p.kind !== "detail" && p.kind !== "form")
      .map((p) => ({ label: p.name, path: p.path, roles: p.roles, plans: p.plans }));
  }
  // Filter nav to only valid paths
  out.nav = (out.nav || []).filter((n) => n.path && typeof n.path === "string" && n.path.startsWith("/"));
  return out;
}

function passCrud(spec) {
  const out = JSON.parse(JSON.stringify(spec));
  const have = new Set(out.pages.map((p) => `${p.kind}:${p.table ?? ""}`));
  const existingPaths = new Set(out.pages.map((p) => p.path));
  for (const t of out.tables) {
    const base = "/" + t.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    if (!have.has(`list:${t.name}`) && !existingPaths.has(base)) {
      out.pages.push({ name: t.label ?? humanize(t.name), path: base, kind: "list", table: t.name });
      existingPaths.add(base);
    }
    if (!have.has(`form:${t.name}`) && !existingPaths.has(base + "/new")) {
      out.pages.push({ name: `New ${singular(t.label ?? t.name)}`, path: base + "/new", kind: "form", table: t.name });
      existingPaths.add(base + "/new");
    }
    if (!have.has(`detail:${t.name}`) && !existingPaths.has(base + "/:id")) {
      out.pages.push({ name: `${singular(t.label ?? t.name)} Detail`, path: base + "/:id", kind: "detail", table: t.name });
      existingPaths.add(base + "/:id");
    }
  }
  return out;
}

function passRoles(spec) {
  const out = JSON.parse(JSON.stringify(spec));
  out.roles = Array.from(new Set(out.roles.map((r) => r.toLowerCase())));
  const valid = new Set(out.roles);
  const fix = (arr) => (arr ? Array.from(new Set(arr.map((r) => r.toLowerCase()).filter((r) => valid.has(r)))) : arr);
  for (const p of (out.pages || [])) p.roles = fix(p.roles);
  for (const n of (out.nav || [])) n.roles = fix(n.roles);
  return out;
}

function passLint(spec) {
  const issues = [];
  const tableNames = new Set(spec.tables.map((t) => t.name));
  for (const p of spec.pages) {
    if ((p.kind === "list" || p.kind === "form" || p.kind === "detail") && !p.table)
      issues.push({ severity: "error", message: `Page "${p.name}" is ${p.kind} but no table set`, where: p.path });
    if (p.table && !tableNames.has(p.table))
      issues.push({ severity: "error", message: `Page "${p.name}" references unknown table "${p.table}"`, where: p.path });
  }
  const referenced = new Set(spec.pages.map((p) => p.table).filter(Boolean));
  for (const t of spec.tables)
    if (!referenced.has(t.name))
      issues.push({ severity: "warn", message: `Table "${t.name}" has no page referencing it`, where: t.name });
  if (!spec.pages.some((p) => p.path === "/"))
    issues.push({ severity: "warn", message: `No page mapped to "/" — runtime will use the first page as home` });
  return issues;
}

function compileAll(raw) {
  const a = passDefaults(raw);
  const b = passCrud(a);
  const c = passRoles(b);
  return { spec: c, lint: passLint(c) };
}

function matchPath(template, actual) {
  const tParts = template.split("/").filter(Boolean);
  const aParts = actual.split("/").filter(Boolean);
  if (tParts.length !== aParts.length) return null;
  const params = {};
  for (let i = 0; i < tParts.length; i++) {
    if (tParts[i].startsWith(":")) params[tParts[i].slice(1)] = aParts[i];
    else if (tParts[i] !== aParts[i]) return null;
  }
  return params;
}

function canSee(item, role, plan) {
  if (item.roles && item.roles.length > 0 && !item.roles.includes(role)) return false;
  if (item.plans && item.plans.length > 0 && !item.plans.includes(plan)) return false;
  return true;
}

function AppRuntime({ spec }) {
  const [role, setRole] = useState(spec.roles[0] ?? "user");
  const [plan, setPlan] = useState((spec.plans ?? ["free"])[0]);
  const [authed, setAuthed] = useState(false);
  const [path, setPath] = useState("/");
  const initData = (s) => {
    const out = {};
    for (const t of (s.tables || [])) out[t.name] = (t.seed ?? []).map((r) => ({ id: uid(), ...r }));
    return out;
  };
  const [data, setData] = useState(() => initData(spec));
  const [formState, setFormState] = useState({});

  useEffect(() => {
    setData(initData(spec));
    setPath("/");
    setAuthed(false);
    setFormState({});
    setRole(spec.roles?.[0] ?? "user");
    setPlan((spec.plans ?? ["free"])[0]);
  }, [spec.name]);

  const visibleNav = (spec.nav || []).filter((n) => canSee(n, role, plan));

  const { page, params } = (() => {
    for (const p of spec.pages) {
      const m = matchPath(p.path, path);
      if (m) return { page: p, params: m };
    }
    const home = spec.pages.find((p) => p.path === "/") ?? spec.pages[0];
    return { page: home, params: {} };
  })();

  const tableByName = {};
  for (const t of spec.tables) tableByName[t.name] = t;

  const navigate = (p) => { setPath(p); setFormState({}); };

  if (!authed) {
    return (
      <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px", height: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: "8px" }}>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>{spec.name}</div>
          <div style={{ fontSize: "12px", color: "#666", maxWidth: "260px", margin: "0 auto" }}>{spec.description}</div>
        </div>
        <div style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: "10px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Sign in to preview</div>
          <div>
            <label style={{ fontSize: "11px", color: "#666", display: "block", marginBottom: "4px" }}>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: "100%", background: "#111", border: "1px solid #333", borderRadius: "6px", color: "#fff", padding: "6px 10px", fontSize: "13px" }}>
              {spec.roles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {spec.plans && spec.plans.length > 1 && (
            <div>
              <label style={{ fontSize: "11px", color: "#666", display: "block", marginBottom: "4px" }}>Plan</label>
              <select value={plan} onChange={(e) => setPlan(e.target.value)} style={{ width: "100%", background: "#111", border: "1px solid #333", borderRadius: "6px", color: "#fff", padding: "6px 10px", fontSize: "13px" }}>
                {spec.plans.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}
          <button onClick={() => setAuthed(true)} style={{ width: "100%", background: "#4f46e5", border: "none", borderRadius: "7px", color: "#fff", padding: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>Enter app →</button>
        </div>
      </div>
    );
  }

  const renderPage = () => {
    if (!page) return <div style={{ color: "#666", padding: "20px", fontSize: "13px" }}>Page not found</div>;
    if (!canSee(page, role, plan)) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "8px", padding: "20px" }}>
          <div style={{ fontSize: "24px" }}>🔒</div>
          <div style={{ color: "#fff", fontSize: "13px", fontWeight: 600 }}>Access restricted</div>
          <div style={{ color: "#666", fontSize: "12px", textAlign: "center" }}>
            {page.roles?.length ? `Requires role: ${page.roles.join(", ")}` : ""}
            {page.plans?.length ? ` • Requires plan: ${page.plans.join(", ")}` : ""}
          </div>
        </div>
      );
    }

    if (page.kind === "dashboard") {
      const tables = spec.tables.slice(0, 4);
      return (
        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>Dashboard</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            {tables.map((t) => (
              <div key={t.name} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "12px" }}>
                <div style={{ fontSize: "10px", color: "#666", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>{t.label ?? humanize(t.name)}</div>
                <div style={{ fontSize: "22px", fontWeight: 700, color: "#fff" }}>{(data[t.name] ?? []).length}</div>
              </div>
            ))}
          </div>
          {spec.tables.slice(0, 2).map((t) => {
            const rows = (data[t.name] ?? []).slice(0, 3);
            if (!rows.length) return null;
            const cols = t.columns.slice(0, 2);
            return (
              <div key={t.name} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "12px" }}>
                <div style={{ fontSize: "11px", color: "#888", marginBottom: "8px", fontWeight: 600 }}>{t.label}</div>
                {rows.map((row) => (
                  <div key={row.id} style={{ display: "flex", gap: "8px", padding: "5px 0", borderBottom: "1px solid #222", fontSize: "12px" }}>
                    {cols.map((c) => <span key={c.name} style={{ color: "#ccc", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(row[c.name] ?? "—")}</span>)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      );
    }

    if (page.kind === "list") {
      const table = tableByName[page.table];
      if (!table) return <div style={{ color: "#666", padding: "16px", fontSize: "12px" }}>Table not found: {page.table}</div>;
      const rows = data[table.name] ?? [];
      const cols = table.columns.slice(0, 3);
      return (
        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>{table.label ?? humanize(table.name)}</div>
            <button onClick={() => navigate(`/${table.name}/new`)} style={{ background: "#4f46e5", border: "none", borderRadius: "6px", color: "#fff", padding: "5px 10px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>+ New</button>
          </div>
          {rows.length === 0 ? (
            <div style={{ color: "#555", fontSize: "12px", textAlign: "center", padding: "20px" }}>No records yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ display: "flex", gap: "8px", padding: "4px 8px" }}>
                {cols.map((c) => <div key={c.name} style={{ flex: 1, fontSize: "10px", color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{c.name}</div>)}
                <div style={{ width: "40px" }} />
              </div>
              {rows.map((row) => (
                <div key={row.id} style={{ display: "flex", alignItems: "center", gap: "8px", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "7px", padding: "8px 10px", cursor: "pointer" }} onClick={() => navigate(`/${table.name}/${row.id}`)}>
                  {cols.map((c) => (
                    <div key={c.name} style={{ flex: 1, fontSize: "12px", color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.type === "boolean" ? (row[c.name] ? "✓" : "✗") : String(row[c.name] ?? "—")}
                    </div>
                  ))}
                  <span style={{ fontSize: "11px", color: "#4f46e5" }}>→</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (page.kind === "form") {
      const table = tableByName[page.table];
      if (!table) return null;
      const handleSubmit = () => {
        const newRow = { id: uid(), ...formState };
        setData((prev) => ({ ...prev, [table.name]: [...(prev[table.name] ?? []), newRow] }));
        navigate(`/${table.name}`);
      };
      return (
        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button onClick={() => navigate(`/${table.name}`)} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: "14px" }}>←</button>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>New {singular(table.label ?? table.name)}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {table.columns.map((col) => (
              <div key={col.name}>
                <label style={{ fontSize: "11px", color: "#888", display: "block", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{col.name}{col.required && " *"}</label>
                {col.type === "boolean" ? (
                  <input type="checkbox" checked={!!formState[col.name]} onChange={(e) => setFormState((p) => ({ ...p, [col.name]: e.target.checked }))} style={{ width: "16px", height: "16px", cursor: "pointer" }} />
                ) : col.type === "select" && col.options ? (
                  <select value={formState[col.name] ?? ""} onChange={(e) => setFormState((p) => ({ ...p, [col.name]: e.target.value }))} style={{ width: "100%", background: "#111", border: "1px solid #333", borderRadius: "6px", color: "#fff", padding: "6px 10px", fontSize: "13px" }}>
                    <option value="">Select…</option>
                    {col.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : col.type === "longtext" ? (
                  <textarea value={formState[col.name] ?? ""} onChange={(e) => setFormState((p) => ({ ...p, [col.name]: e.target.value }))} rows={3} style={{ width: "100%", background: "#111", border: "1px solid #333", borderRadius: "6px", color: "#fff", padding: "6px 10px", fontSize: "13px", resize: "vertical", boxSizing: "border-box" }} />
                ) : (
                  <input type={col.type === "number" ? "number" : col.type === "date" ? "date" : col.type === "email" ? "email" : "text"} value={formState[col.name] ?? ""} onChange={(e) => setFormState((p) => ({ ...p, [col.name]: e.target.value }))} style={{ width: "100%", background: "#111", border: "1px solid #333", borderRadius: "6px", color: "#fff", padding: "6px 10px", fontSize: "13px", boxSizing: "border-box" }} />
                )}
              </div>
            ))}
            <button onClick={handleSubmit} style={{ background: "#4f46e5", border: "none", borderRadius: "7px", color: "#fff", padding: "9px", fontSize: "13px", fontWeight: 600, cursor: "pointer", marginTop: "4px" }}>Save</button>
          </div>
        </div>
      );
    }

    if (page.kind === "detail") {
      const table = tableByName[page.table];
      if (!table) return null;
      const row = (data[table.name] ?? []).find((r) => r.id === params.id);
      if (!row) return <div style={{ color: "#666", padding: "16px", fontSize: "12px" }}>Record not found.</div>;
      const handleDelete = () => {
        setData((prev) => ({ ...prev, [table.name]: prev[table.name].filter((r) => r.id !== row.id) }));
        navigate(`/${table.name}`);
      };
      return (
        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button onClick={() => navigate(`/${table.name}`)} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: "14px" }}>←</button>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>{singular(table.label ?? table.name)}</div>
            </div>
            <button onClick={handleDelete} style={{ background: "none", border: "1px solid #3a1515", borderRadius: "6px", color: "#e05353", padding: "4px 8px", fontSize: "11px", cursor: "pointer" }}>Delete</button>
          </div>
          <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "10px", padding: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {table.columns.map((col) => (
              <div key={col.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: "11px", color: "#666", textTransform: "uppercase", letterSpacing: "0.06em" }}>{col.name}</span>
                <span style={{ fontSize: "12px", color: "#ccc", maxWidth: "60%", textAlign: "right", wordBreak: "break-word" }}>
                  {col.type === "boolean" ? (row[col.name] ? "✓ Yes" : "✗ No") : String(row[col.name] ?? "—")}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (page.kind === "static") {
      return (
        <div style={{ padding: "20px" }}>
          <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff", marginBottom: "10px" }}>{page.name}</div>
          <div style={{ fontSize: "13px", color: "#999", lineHeight: 1.6 }}>{page.body}</div>
        </div>
      );
    }

    return <div style={{ color: "#666", padding: "16px", fontSize: "12px" }}>Unknown page kind: {page.kind}</div>;
  };

  return (
    <div style={{ display: "flex", height: "100%", minHeight: "520px", background: "#0d0d0d", borderRadius: "10px", overflow: "hidden", fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      <div style={{ width: "160px", background: "#111", borderRight: "1px solid #1e1e1e", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "14px 12px 10px", borderBottom: "1px solid #1e1e1e" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{spec.name}</div>
        </div>
        <nav style={{ flex: 1, padding: "8px", display: "flex", flexDirection: "column", gap: "2px" }}>
          {visibleNav.map((n) => (
            <button key={n.path} onClick={() => navigate(n.path)} style={{ textAlign: "left", padding: "6px 8px", borderRadius: "6px", fontSize: "12px", border: "none", cursor: "pointer", background: path === n.path ? "#4f46e5" : "transparent", color: path === n.path ? "#fff" : "#888", fontWeight: path === n.path ? 600 : 400 }}>
              {n.label}
            </button>
          ))}
        </nav>
        <div style={{ padding: "8px", borderTop: "1px solid #1e1e1e", display: "flex", flexDirection: "column", gap: "6px" }}>
          <select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: "100%", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "5px", color: "#aaa", padding: "4px 6px", fontSize: "10px" }}>
            {spec.roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {spec.plans && spec.plans.length > 1 && (
            <select value={plan} onChange={(e) => setPlan(e.target.value)} style={{ width: "100%", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "5px", color: "#aaa", padding: "4px 6px", fontSize: "10px" }}>
              {spec.plans.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>{renderPage()}</div>
    </div>
  );
}

function SpecInspector({ spec, lint }) {
  const [tab, setTab] = useState("overview");
  const tabs = ["overview", "db", "auth", "pages", "lint"];
  const errors = lint.filter((l) => l.severity === "error");
  const warns = lint.filter((l) => l.severity === "warn");

  return (
    <div style={{ background: "#111", border: "1px solid #222", borderRadius: "10px", overflow: "hidden" }}>
      <div style={{ display: "flex", borderBottom: "1px solid #1e1e1e" }}>
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "8px 4px", background: tab === t ? "#1a1a1a" : "transparent", border: "none", borderBottom: tab === t ? "2px solid #4f46e5" : "2px solid transparent", color: tab === t ? "#fff" : "#666", fontSize: "11px", fontWeight: tab === t ? 600 : 400, cursor: "pointer", textTransform: "capitalize" }}>
            {t}{t === "lint" && lint.length > 0 ? ` (${lint.length})` : ""}
          </button>
        ))}
      </div>
      <div style={{ padding: "12px", fontSize: "12px" }}>
        {tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ fontWeight: 700, color: "#fff", fontSize: "14px" }}>{spec.name}</div>
            <div style={{ color: "#888", lineHeight: 1.5 }}>{spec.description}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "4px" }}>
              {[["Tables", spec.tables.length], ["Pages", spec.pages.length], ["Roles", spec.roles.length]].map(([l, v]) => (
                <div key={l} style={{ background: "#1a1a1a", border: "1px solid #222", borderRadius: "7px", padding: "10px", textAlign: "center" }}>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: "#fff" }}>{v}</div>
                  <div style={{ fontSize: "10px", color: "#666", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "2px" }}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {errors.length > 0 && <span style={{ fontSize: "11px", background: "#2a1010", color: "#e05353", padding: "3px 8px", borderRadius: "5px" }}>{errors.length} error{errors.length > 1 ? "s" : ""}</span>}
              {warns.length > 0 && <span style={{ fontSize: "11px", background: "#1f1a0a", color: "#d97706", padding: "3px 8px", borderRadius: "5px" }}>{warns.length} warning{warns.length > 1 ? "s" : ""}</span>}
              {errors.length === 0 && warns.length === 0 && <span style={{ fontSize: "11px", background: "#0a1f10", color: "#34d399", padding: "3px 8px", borderRadius: "5px" }}>✓ clean</span>}
            </div>
          </div>
        )}
        {tab === "db" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {spec.tables.length === 0 && <div style={{ color: "#555" }}>No tables.</div>}
            {spec.tables.map((t) => (
              <div key={t.name} style={{ background: "#1a1a1a", border: "1px solid #252525", borderRadius: "7px", padding: "10px" }}>
                <div style={{ color: "#fff", fontWeight: 600, marginBottom: "6px" }}>{t.name}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  {t.columns.map((c) => (
                    <div key={c.name} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontFamily: "monospace", color: "#ccc", fontSize: "11px" }}>{c.name}</span>
                      <span style={{ fontSize: "10px", background: "#252540", color: "#818cf8", padding: "1px 6px", borderRadius: "4px" }}>{c.type}</span>
                      {c.required && <span style={{ fontSize: "10px", color: "#e05353" }}>required</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === "auth" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div>
              <div style={{ fontSize: "10px", color: "#666", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>Roles</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                {spec.roles.map((r) => <span key={r} style={{ fontSize: "11px", background: "#1a1a2e", color: "#818cf8", padding: "3px 8px", borderRadius: "5px", border: "1px solid #252545" }}>{r}</span>)}
              </div>
            </div>
            {spec.plans && (
              <div>
                <div style={{ fontSize: "10px", color: "#666", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>Plans</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                  {spec.plans.map((p) => <span key={p} style={{ fontSize: "11px", background: "#1a1a2e", color: "#a78bfa", padding: "3px 8px", borderRadius: "5px", border: "1px solid #252545" }}>{p}</span>)}
                </div>
              </div>
            )}
          </div>
        )}
        {tab === "pages" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            {spec.pages.map((p) => (
              <div key={p.path} style={{ background: "#1a1a1a", border: "1px solid #252525", borderRadius: "6px", padding: "8px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ color: "#ccc", fontWeight: 500, fontSize: "12px" }}>{p.name}</div>
                  <div style={{ fontFamily: "monospace", color: "#555", fontSize: "10px", marginTop: "1px" }}>{p.path}</div>
                </div>
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <span style={{ fontSize: "10px", background: "#1e2020", color: "#6ee7b7", padding: "1px 5px", borderRadius: "4px" }}>{p.kind}</span>
                  {p.roles?.map((r) => <span key={r} style={{ fontSize: "10px", background: "#1a1a2e", color: "#818cf8", padding: "1px 5px", borderRadius: "4px" }}>{r}</span>)}
                  {p.plans?.map((pl) => <span key={pl} style={{ fontSize: "10px", background: "#1f1520", color: "#c084fc", padding: "1px 5px", borderRadius: "4px" }}>{pl}</span>)}
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === "lint" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {lint.length === 0 && <div style={{ color: "#34d399", fontSize: "12px" }}>✓ No issues found</div>}
            {lint.map((l, i) => (
              <div key={i} style={{ background: l.severity === "error" ? "#1a0a0a" : "#1a140a", border: `1px solid ${l.severity === "error" ? "#3a1515" : "#3a2a0a"}`, borderRadius: "6px", padding: "8px 10px" }}>
                <div style={{ color: l.severity === "error" ? "#e05353" : "#d97706", fontSize: "12px" }}>{l.message}</div>
                {l.where && <div style={{ fontFamily: "monospace", color: "#555", fontSize: "10px", marginTop: "2px" }}>{l.where}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const COMPILE_SYSTEM = `You are "Synthesize", a compiler that converts a natural-language app description into a strict JSON specification.

CRITICAL: Output ONLY raw JSON. No markdown. No backticks. No code fences. No explanations. Start your response with { and end with }.

The JSON must match this shape:
{
  "name": "AppName",
  "description": "Short description",
  "roles": ["admin", "user"],
  "plans": ["free", "premium"],
  "tables": [
    {
      "name": "snake_case_name",
      "label": "Human Label",
      "columns": [
        { "name": "col_name", "type": "text", "required": true }
      ],
      "seed": [{ "col_name": "Example value" }]
    }
  ],
  "pages": [
    { "name": "Dashboard", "path": "/", "kind": "dashboard" },
    { "name": "Items", "path": "/items", "kind": "list", "table": "items" }
  ],
  "nav": [{ "label": "Dashboard", "path": "/" }]
}

Column types: "text" | "longtext" | "number" | "boolean" | "date" | "email" | "select"
Page kinds: "list" | "form" | "detail" | "dashboard" | "static"

RULES:
- Always include exactly one page with path "/" (a dashboard or home page).
- Include list/form/detail pages for each table in pages array.
- Use page.roles (array of role strings) to restrict admin-only pages.
- Use page.plans=["premium"] to gate premium features.
- Pick 2-4 tables maximum. Keep column names short and snake_case.
- Add 2-4 realistic seed rows per table with keys matching column names.
- nav should include list/dashboard pages only (not form/detail).
- Output ONLY valid JSON. Absolutely no markdown fences, no backticks, no comments, no trailing commas.`;

function extractJSON(raw) {
  // 1. Try direct parse first
  try { return JSON.parse(raw.trim()); } catch {}

  // 2. Strip markdown fences: ```json ... ``` or ``` ... ```
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/s);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch {}
  }

  // 3. Find first { ... } block (outermost braces)
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch {}
  }

  // 4. Nothing worked
  throw new Error("Model returned unparseable output. Please try again.");
}

async function callClaudeAPI(messages) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: COMPILE_SYSTEM }] },
        contents: messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}${body ? ": " + body.slice(0, 120) : ""}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Empty response from Gemini.");
  return text;
}

async function callClaude(userPrompt, retryError) {
  const messages = [{ role: "user", content: userPrompt }];
  if (retryError) {
    messages.push({
      role: "assistant",
      content: "I apologize for the error. Let me provide the corrected JSON:",
    });
    messages.push({
      role: "user",
      content: `Your previous response failed with: "${retryError}". Output ONLY raw JSON starting with { — no backticks, no markdown, no explanation.`,
    });
  }
  const raw = await callClaudeAPI(messages);
  return extractJSON(raw);
}

function CompilerStudio() {
  const [prompt, setPrompt] = useState("");
  const [spec, setSpec] = useState(null);
  const [lint, setLint] = useState([]);
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(null);
  const [error, setError] = useState(null);
  const [activeExample, setActiveExample] = useState(null);

  async function onCompile() {
    if (prompt.trim().length < 5) return;
    setLoading(true);
    setError(null);
    setAttempts(null);
    let lastErr = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      setAttempts(attempt);
      try {
        const raw = await callClaude(prompt, attempt > 1 ? lastErr : undefined);
        if (!raw || typeof raw !== "object") throw new Error("Model returned non-object JSON.");
        if (!Array.isArray(raw.roles) || raw.roles.length === 0) raw.roles = ["admin", "user"];
        if (!Array.isArray(raw.pages) || raw.pages.length === 0) throw new Error("Spec has no pages.");
        if (!Array.isArray(raw.tables)) raw.tables = [];
        if (!Array.isArray(raw.nav)) raw.nav = [];
        const { spec: compiled, lint: lintResults } = compileAll(raw);
        setSpec(compiled);
        setLint(lintResults);
        setLoading(false);
        return;
      } catch (e) {
        lastErr = e.message;
      }
    }
    setError(lastErr || "Compilation failed after 3 attempts. Try rephrasing your prompt.");
    setLoading(false);
  }

  function onExport() {
    if (!spec) return;
    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${spec.name.replace(/\s+/g, "-").toLowerCase()}.spec.json`;
    a.click();
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", padding: "0 32px 40px" }}>
      {/* Left panel */}
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "12px", padding: "18px" }}>
          <label style={{ fontSize: "11px", color: "#666", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "10px", fontWeight: 600 }}>Describe your app</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onCompile(); }}
            rows={6}
            placeholder='e.g. "Build a CRM with contacts, deals, role-based access, and a premium analytics page."'
            style={{ width: "100%", background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: "8px", color: "#d1d5db", padding: "10px 12px", fontSize: "13px", fontFamily: "monospace", resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.6 }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "10px" }}>
            {EXAMPLES.map((ex, i) => (
              <button key={i} onClick={() => { setPrompt(ex); setActiveExample(i); }} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "5px", border: `1px solid ${activeExample === i ? "#4f46e5" : "#2a2a2a"}`, background: activeExample === i ? "#1a1a3e" : "#1a1a1a", color: activeExample === i ? "#818cf8" : "#888", cursor: "pointer" }}>
                Example {i + 1}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
            <button onClick={onCompile} disabled={loading || prompt.trim().length < 5} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", background: loading ? "#2a2a4a" : "#4f46e5", border: "none", borderRadius: "8px", color: "#fff", padding: "10px", fontSize: "13px", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: prompt.trim().length < 5 ? 0.5 : 1 }}>
              {loading ? (
                <>
                  <span style={{ display: "inline-block", width: "13px", height: "13px", border: "2px solid #fff3", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                  Compiling…
                </>
              ) : (
                <>✦ Compile</>
              )}
            </button>
            <button onClick={onExport} disabled={!spec} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "8px", color: spec ? "#ccc" : "#444", padding: "10px 14px", fontSize: "13px", cursor: spec ? "pointer" : "not-allowed" }}>
              ↓
            </button>
          </div>
          {error && <div style={{ marginTop: "10px", fontSize: "12px", color: "#e05353", background: "#1a0a0a", border: "1px solid #3a1515", borderRadius: "6px", padding: "8px 10px" }}>{error}</div>}
          {attempts !== null && !error && (
            <div style={{ marginTop: "8px", fontSize: "11px", color: "#666", display: "flex", alignItems: "center", gap: "6px" }}>
              <span>Compiled in {attempts} attempt{attempts > 1 ? "s" : ""}</span>
              {lint.length === 0 && <span style={{ color: "#34d399" }}>✓ clean</span>}
              {lint.filter((l) => l.severity === "error").length > 0 && <span style={{ color: "#e05353" }}>{lint.filter((l) => l.severity === "error").length} errors</span>}
              {lint.filter((l) => l.severity === "warn").length > 0 && <span style={{ color: "#d97706" }}>{lint.filter((l) => l.severity === "warn").length} warnings</span>}
            </div>
          )}
        </div>
        {spec && <SpecInspector spec={spec} lint={lint} />}
      </div>

      {/* Right panel */}
      <div>
        <div style={{ fontSize: "11px", color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px", fontWeight: 600 }}>Live runtime</div>
        {spec ? (
          <AppRuntime spec={spec} />
        ) : (
          <div style={{ border: "2px dashed #1e1e1e", borderRadius: "12px", minHeight: "520px", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: "32px", opacity: 0.3 }}>✦</div>
            <div style={{ color: "#444", fontSize: "13px", textAlign: "center", maxWidth: "220px", lineHeight: 1.5 }}>
              Describe an app on the left and hit <strong style={{ color: "#666" }}>Compile</strong> — a working preview appears here.
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Simple in-memory user store (persisted to sessionStorage for the session)
function getUsers() {
  try { return JSON.parse(sessionStorage.getItem("synth_users") || "[]"); } catch { return []; }
}
function saveUsers(users) {
  try { sessionStorage.setItem("synth_users", JSON.stringify(users)); } catch {}
}
function getCurrentUser() {
  try { return JSON.parse(sessionStorage.getItem("synth_current_user") || "null"); } catch { return null; }
}
function setCurrentUser(user) {
  try { sessionStorage.setItem("synth_current_user", JSON.stringify(user)); } catch {}
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleSubmit() {
    setError("");
    if (!email.trim() || !password.trim()) { setError("Email and password are required."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Enter a valid email address."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    setTimeout(() => {
      const users = getUsers();
      if (mode === "signup") {
        if (!name.trim()) { setError("Full name is required."); setLoading(false); return; }
        if (users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
          setError("An account with this email already exists. Sign in instead."); setLoading(false); return;
        }
        const user = { id: Math.random().toString(36).slice(2), name: name.trim(), email: email.trim().toLowerCase(), createdAt: new Date().toISOString() };
        saveUsers([...users, { ...user, password }]);
        setCurrentUser(user);
        onAuth(user);
      } else {
        const found = users.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
        if (!found) { setError("Invalid email or password."); setLoading(false); return; }
        const { password: _, ...user } = found;
        setCurrentUser(user);
        onAuth(user);
      }
      setLoading(false);
    }, 600);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#080808", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', -apple-system, sans-serif", padding: "24px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes glow { 0%,100% { opacity: 0.3; } 50% { opacity: 0.7; } }
        .auth-input { width: 100%; background: #0d0d0d; border: 1px solid #2a2a2a; border-radius: 8px; color: #e5e7eb; padding: 10px 14px; fontSize: 14px; outline: none; transition: border-color 0.2s; font-family: inherit; font-size: 14px; }
        .auth-input:focus { border-color: #4f46e5; }
        .auth-input::placeholder { color: #444; }
      `}</style>

      {/* Background glow */}
      <div style={{ position: "fixed", top: "40%", left: "50%", transform: "translate(-50%, -50%)", width: "500px", height: "300px", background: "radial-gradient(ellipse, rgba(79,70,229,0.15) 0%, transparent 70%)", animation: "glow 4s ease-in-out infinite", pointerEvents: "none" }} />

      <div style={{ position: "relative", width: "100%", maxWidth: "400px", animation: "fadeUp 0.6s ease both" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <div style={{ fontSize: "24px", fontWeight: 800, background: "linear-gradient(135deg, #818cf8, #c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: "8px" }}>✦ Synthesize</div>
          <div style={{ fontSize: "13px", color: "#555" }}>Natural-language app compiler</div>
        </div>

        {/* Card */}
        <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "16px", padding: "32px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h2>
          <p style={{ fontSize: "13px", color: "#555", marginBottom: "24px" }}>
            {mode === "signin" ? "Sign in to access the studio." : "Get started — it's free."}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {mode === "signup" && (
              <div>
                <label style={{ fontSize: "11px", color: "#666", display: "block", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>Full name</label>
                <input className="auth-input" type="text" placeholder="Jane Doe" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />
              </div>
            )}
            <div>
              <label style={{ fontSize: "11px", color: "#666", display: "block", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>Email</label>
              <input className="auth-input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />
            </div>
            <div>
              <label style={{ fontSize: "11px", color: "#666", display: "block", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>Password</label>
              <input className="auth-input" type="password" placeholder="Min. 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />
            </div>

            {error && (
              <div style={{ background: "#1a0a0a", border: "1px solid #3a1515", borderRadius: "7px", padding: "9px 12px", fontSize: "12px", color: "#e05353" }}>
                {error}
              </div>
            )}

            <button onClick={handleSubmit} disabled={loading} style={{ width: "100%", background: loading ? "#2a2a4a" : "#4f46e5", border: "none", borderRadius: "9px", color: "#fff", padding: "11px", fontSize: "14px", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "4px" }}>
              {loading ? (
                <><span style={{ display: "inline-block", width: "14px", height: "14px", border: "2px solid #fff3", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> {mode === "signin" ? "Signing in…" : "Creating account…"}</>
              ) : (
                mode === "signin" ? "Sign in →" : "Create account →"
              )}
            </button>
          </div>

          <div style={{ marginTop: "20px", textAlign: "center", borderTop: "1px solid #1a1a1a", paddingTop: "20px" }}>
            <span style={{ fontSize: "13px", color: "#555" }}>
              {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
            </span>
            <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }} style={{ background: "none", border: "none", color: "#818cf8", fontSize: "13px", fontWeight: 600, cursor: "pointer", padding: 0 }}>
              {mode === "signin" ? "Sign up" : "Sign in"}
            </button>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: "20px", fontSize: "11px", color: "#333" }}>
          Accounts are stored locally in your session only.
        </div>
      </div>
    </div>
  );
}

export default function Synthesize() {
  const [user, setUser] = useState(() => getCurrentUser());
  const [view, setView] = useState("landing");
  const [scrolled, setScrolled] = useState(false);

  if (!user) {
    return <AuthScreen onAuth={(u) => setUser(u)} />;
  }

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <div style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", background: "#080808", color: "#e5e7eb", minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes glow { 0%,100% { opacity: 0.4; } 50% { opacity: 0.8; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
      `}</style>

      {/* Navbar */}
      <nav style={{ position: "sticky", top: 0, zIndex: 100, background: scrolled ? "rgba(8,8,8,0.92)" : "transparent", backdropFilter: scrolled ? "blur(12px)" : "none", borderBottom: scrolled ? "1px solid #1a1a1a" : "1px solid transparent", transition: "all 0.3s ease", padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: "60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }} onClick={() => setView("landing")}>
          <span style={{ fontSize: "18px", fontWeight: 800, background: "linear-gradient(135deg, #818cf8, #c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>✦ Synthesize</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {view !== "landing" && (
            <button onClick={() => setView("landing")} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "8px", color: "#aaa", padding: "7px 16px", fontSize: "13px", cursor: "pointer" }}>
              ← Back
            </button>
          )}
          {view === "landing" && (
            <button onClick={() => setView("studio")} style={{ background: "#4f46e5", border: "none", borderRadius: "8px", color: "#fff", padding: "8px 20px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
              Open Studio →
            </button>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#1a1a1a", border: "1px solid #222", borderRadius: "8px", padding: "5px 10px 5px 8px" }}>
            <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: "linear-gradient(135deg, #4f46e5, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, color: "#fff", flexShrink: 0 }}>
              {user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
            </div>
            <span style={{ fontSize: "12px", color: "#aaa", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name || user.email}</span>
            <button onClick={() => { setCurrentUser(null); setUser(null); }} style={{ background: "none", border: "none", color: "#555", fontSize: "11px", cursor: "pointer", padding: "0 0 0 4px", borderLeft: "1px solid #2a2a2a", marginLeft: "2px", paddingLeft: "8px" }}>
              Sign out
            </button>
          </div>
        </div>
      </nav>

      {view === "landing" ? (
        <>
          {/* Hero */}
          <section style={{ padding: "80px 32px 60px", textAlign: "center", position: "relative", overflow: "hidden" }}>
            {/* Glow bg */}
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-60%)", width: "600px", height: "400px", background: "radial-gradient(ellipse, rgba(79,70,229,0.18) 0%, transparent 70%)", animation: "glow 4s ease-in-out infinite", pointerEvents: "none" }} />
            <div style={{ position: "relative", maxWidth: "700px", margin: "0 auto", animation: "fadeUp 0.7s ease both" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: "100px", padding: "5px 14px", fontSize: "12px", color: "#818cf8", marginBottom: "28px" }}>
                <span style={{ width: "6px", height: "6px", background: "#4f46e5", borderRadius: "50%", display: "inline-block", animation: "glow 2s infinite" }} />
                AI-powered app compiler · Natural language → working app
              </div>
              <h1 style={{ fontSize: "clamp(36px, 6vw, 64px)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", marginBottom: "20px" }}>
                Turn words into{" "}
                <span style={{ background: "linear-gradient(135deg, #818cf8 0%, #c084fc 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  working apps
                </span>
              </h1>
              <p style={{ fontSize: "18px", color: "#9ca3af", lineHeight: 1.6, marginBottom: "36px", maxWidth: "500px", margin: "0 auto 36px" }}>
                Describe your app in plain English. Synthesize compiles it into a validated spec with auth, data schema, pages, and a live preview — in seconds.
              </p>
              <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
                <button onClick={() => setView("studio")} style={{ background: "#4f46e5", border: "none", borderRadius: "10px", color: "#fff", padding: "14px 32px", fontSize: "15px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
                  Start Building ✦
                </button>
                <button style={{ background: "transparent", border: "1px solid #2a2a2a", borderRadius: "10px", color: "#888", padding: "14px 24px", fontSize: "15px", cursor: "pointer" }}>
                  See examples →
                </button>
              </div>
            </div>

            {/* Demo card */}
            <div style={{ maxWidth: "760px", margin: "60px auto 0", animation: "fadeUp 0.9s ease 0.2s both", position: "relative" }}>
              <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "16px", overflow: "hidden", boxShadow: "0 40px 80px rgba(0,0,0,0.6)" }}>
                <div style={{ background: "#161616", borderBottom: "1px solid #1e1e1e", padding: "10px 16px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ display: "flex", gap: "5px" }}>
                    {["#ff5f56","#ffbd2e","#27c93f"].map((c) => <div key={c} style={{ width: "10px", height: "10px", borderRadius: "50%", background: c }} />)}
                  </div>
                  <div style={{ flex: 1, background: "#0d0d0d", borderRadius: "6px", padding: "4px 12px", fontSize: "11px", color: "#444", textAlign: "center" }}>synthesize.app/studio</div>
                </div>
                <div style={{ padding: "24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: "8px", padding: "12px" }}>
                      <div style={{ fontSize: "10px", color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Prompt</div>
                      <div style={{ fontSize: "12px", color: "#9ca3af", fontFamily: "monospace", lineHeight: 1.6 }}>Build a CRM with contacts, deals, role-based access for admin and sales, and a premium analytics page.</div>
                    </div>
                    <div style={{ background: "#0a0f0a", border: "1px solid #1a2a1a", borderRadius: "8px", padding: "12px" }}>
                      <div style={{ fontSize: "10px", color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Spec output</div>
                      <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#6ee7b7", lineHeight: 1.8 }}>
                        <div style={{ color: "#555" }}>{"{"}</div>
                        <div style={{ paddingLeft: "12px" }}><span style={{ color: "#818cf8" }}>"name"</span><span style={{ color: "#666" }}>: </span><span style={{ color: "#fbbf24" }}>"TinyCRM"</span><span style={{ color: "#555" }}>,</span></div>
                        <div style={{ paddingLeft: "12px" }}><span style={{ color: "#818cf8" }}>"roles"</span><span style={{ color: "#666" }}>: </span><span style={{ color: "#6ee7b7" }}>["admin","sales","user"]</span><span style={{ color: "#555" }}>,</span></div>
                        <div style={{ paddingLeft: "12px" }}><span style={{ color: "#818cf8" }}>"tables"</span><span style={{ color: "#666" }}>: </span><span style={{ color: "#6ee7b7" }}>[…3 tables]</span><span style={{ color: "#555" }}>,</span></div>
                        <div style={{ paddingLeft: "12px" }}><span style={{ color: "#818cf8" }}>"pages"</span><span style={{ color: "#666" }}>: </span><span style={{ color: "#6ee7b7" }}>[…8 pages]</span></div>
                        <div style={{ color: "#555" }}>{"}"}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: "8px", overflow: "hidden" }}>
                    <div style={{ padding: "10px 12px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ fontSize: "11px", color: "#666", fontWeight: 600 }}>Live preview</div>
                      <span style={{ fontSize: "10px", background: "#0a1f10", color: "#34d399", padding: "2px 7px", borderRadius: "4px" }}>✓ compiled</span>
                    </div>
                    <div style={{ padding: "12px", display: "flex", gap: "8px" }}>
                      <div style={{ width: "100px", background: "#111", borderRadius: "6px", padding: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                        {["Dashboard", "Contacts", "Deals", "Analytics"].map((item, i) => (
                          <div key={item} style={{ padding: "5px 7px", borderRadius: "5px", fontSize: "11px", background: i === 0 ? "#4f46e5" : "transparent", color: i === 0 ? "#fff" : "#666" }}>{item}</div>
                        ))}
                      </div>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px" }}>
                          {[["Contacts","24"],["Deals","12"]].map(([l, v]) => (
                            <div key={l} style={{ background: "#1a1a1a", borderRadius: "5px", padding: "7px 8px" }}>
                              <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>{v}</div>
                              <div style={{ fontSize: "9px", color: "#555" }}>{l}</div>
                            </div>
                          ))}
                        </div>
                        {[["Alice Chen", "Lead"],["Bob Smith", "Prospect"]].map(([n, s]) => (
                          <div key={n} style={{ background: "#151515", border: "1px solid #1e1e1e", borderRadius: "5px", padding: "6px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "11px", color: "#ccc" }}>{n}</span>
                            <span style={{ fontSize: "9px", color: "#818cf8", background: "#1a1a3e", padding: "1px 5px", borderRadius: "3px" }}>{s}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Features */}
          <section style={{ padding: "60px 32px", maxWidth: "1000px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "48px" }}>
              <h2 style={{ fontSize: "32px", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "12px" }}>Everything built in</h2>
              <p style={{ color: "#9ca3af", fontSize: "15px" }}>From prompt to live preview — the whole pipeline runs in your browser.</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "14px" }}>
              {FEATURE_CARDS.map((f) => (
                <div key={f.title} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "12px", padding: "20px", transition: "border-color 0.2s", cursor: "default" }} onMouseEnter={(e) => e.currentTarget.style.borderColor = "#2a2a4a"} onMouseLeave={(e) => e.currentTarget.style.borderColor = "#1e1e1e"}>
                  <div style={{ fontSize: "24px", marginBottom: "12px" }}>{f.icon}</div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>{f.title}</div>
                  <div style={{ fontSize: "13px", color: "#6b7280", lineHeight: 1.6 }}>{f.desc}</div>
                </div>
              ))}
            </div>
          </section>

          {/* How it works */}
          <section style={{ padding: "60px 32px", maxWidth: "860px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "48px" }}>
              <h2 style={{ fontSize: "32px", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "12px" }}>How it works</h2>
              <p style={{ color: "#9ca3af", fontSize: "15px" }}>A 4-pass compiler pipeline that validates every spec before rendering.</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {[
                ["01", "Describe", "Write a plain-English description of the app you want to build.", "#818cf8"],
                ["02", "Compile", "Claude parses your description into a strict JSON spec with tables, pages, roles, and nav.", "#c084fc"],
                ["03", "Validate", "4 compiler passes run: defaults, CRUD inference, role normalization, and semantic lint.", "#6ee7b7"],
                ["04", "Preview", "A fully interactive app preview renders in your browser with real data, navigation, and role-based access.", "#fbbf24"],
              ].map(([num, title, desc, color]) => (
                <div key={num} style={{ display: "flex", gap: "20px", padding: "20px 0", borderBottom: "1px solid #111" }}>
                  <div style={{ fontSize: "11px", fontWeight: 800, color, width: "24px", flexShrink: 0, paddingTop: "2px", opacity: 0.7 }}>{num}</div>
                  <div>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff", marginBottom: "5px" }}>{title}</div>
                    <div style={{ fontSize: "13px", color: "#6b7280", lineHeight: 1.6 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* CTA */}
          <section style={{ padding: "80px 32px", textAlign: "center" }}>
            <div style={{ maxWidth: "480px", margin: "0 auto" }}>
              <h2 style={{ fontSize: "36px", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "16px" }}>
                Ready to build?
              </h2>
              <p style={{ color: "#9ca3af", marginBottom: "32px", fontSize: "15px", lineHeight: 1.6 }}>
                Open the studio and describe your first app. It takes less than 30 seconds.
              </p>
              <button onClick={() => setView("studio")} style={{ background: "#4f46e5", border: "none", borderRadius: "10px", color: "#fff", padding: "14px 40px", fontSize: "15px", fontWeight: 700, cursor: "pointer" }}>
                Open Studio ✦
              </button>
            </div>
          </section>

          {/* Footer */}
          <footer style={{ borderTop: "1px solid #111", padding: "24px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, background: "linear-gradient(135deg, #818cf8, #c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>✦ Synthesize</span>
            <div style={{ fontSize: "12px", color: "#444" }}>Natural-language app compiler · Built with Claude</div>
          </footer>
        </>
      ) : (
        /* Studio view */
        <div style={{ paddingTop: "24px" }}>
          <div style={{ padding: "0 32px 24px" }}>
            <h1 style={{ fontSize: "22px", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "6px" }}>
              <span style={{ background: "linear-gradient(135deg, #818cf8, #c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>✦</span> Compiler Studio
            </h1>
            <p style={{ fontSize: "13px", color: "#666" }}>Describe an app → compile → inspect → preview. Press ⌘↵ to compile.</p>
          </div>
          <CompilerStudio />
        </div>
      )}
    </div>
  );
}
