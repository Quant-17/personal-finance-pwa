import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronRight,
  Cloud,
  CreditCard,
  Download,
  FlaskConical,
  House,
  LayoutDashboard,
  Menu,
  Moon,
  PiggyBank,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Target,
  Wallet,
  WifiOff,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "./components/ui/button";
import { Simulator, type SimulatorInputs } from "./components/Simulator";
import {
  accounts,
  categories,
  demo,
  freeCash,
  transactions,
  trends,
  upcoming,
} from "./lib/data";
import { formatMoney } from "./lib/finance";

type Page = "overview" | "simulator" | "accounts" | "budgets" | "activity";
const navigation: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "accounts", label: "Accounts", icon: Wallet },
  { id: "activity", label: "Transactions", icon: ReceiptText },
  { id: "budgets", label: "Budgets & goals", icon: Target },
  { id: "simulator", label: "Buy simulator", icon: Sparkles },
];
function getPage(): Page {
  const hash = window.location.hash.slice(1);
  return navigation.some((n) => n.id === hash) ? (hash as Page) : "overview";
}
function readTheme() {
  try {
    return (
      localStorage.getItem("folio-theme") ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light")
    );
  } catch {
    return "light";
  }
}

export default function App() {
  const [page, setPage] = useState<Page>(getPage);
  const [theme, setTheme] = useState(readTheme);
  // Shared across preview/full routes, with no browser-storage persistence.
  const [purchase, setPurchase] = useState<SimulatorInputs>({
    price: "85000",
    apr: "14",
    months: "12",
    delay: "6",
    method: "emi",
  });
  const [menu, setMenu] = useState(false);
  const [notice, setNotice] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => {
    const listener = () => {
      setPage(getPage());
      setMenu(false);
    };
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem("folio-theme", theme);
    } catch {
      /* Storage may be unavailable in private browsing. */
    }
  }, [theme]);
  useEffect(() => {
    const listener = () => setOnline(navigator.onLine);
    window.addEventListener("online", listener);
    window.addEventListener("offline", listener);
    return () => {
      window.removeEventListener("online", listener);
      window.removeEventListener("offline", listener);
    };
  }, []);
  useEffect(() => {
    if (!menu) return;
    const previous = document.activeElement as HTMLElement | null;
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    sidebar?.querySelector<HTMLElement>(".mobile-close")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
      if (event.key !== "Tab") return;
      const elements = [
        ...(sidebar?.querySelectorAll<HTMLElement>("a, button") ?? []),
      ].filter((element) => element.offsetParent !== null);
      const first = elements[0],
        last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      previous?.focus();
    };
  }, [menu]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [page]);
  const go = (next: Page) => {
    window.location.hash = next;
    setPage(next);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  return (
    <div className="app-layout">
      <a
        href="#main"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      {menu && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside
        className={`sidebar ${menu ? "open" : ""}`}
        aria-label="Main navigation"
        role={menu ? "dialog" : undefined}
        aria-modal={menu ? true : undefined}
      >
        <a
          href="#overview"
          className="brand"
          onClick={(event) => {
            if (
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            go("overview");
          }}
        >
          <span className="brand-icon">
            <ChartNoAxesCombined size={24} />
          </span>
          folio<span className="brand-dot">.</span>
        </a>
        <Button
          className="mobile-close"
          variant="ghost"
          size="icon"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        >
          <X size={20} />
        </Button>
        <div className="workspace-label">PERSONAL WORKSPACE</div>
        <nav>
          {navigation.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(event) => {
                if (
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                go(item.id);
              }}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              aria-current={page === item.id ? "page" : undefined}
            >
              <item.icon size={19} />
              {item.label}
              {item.id === "simulator" && <span className="new-tag">NEW</span>}
            </a>
          ))}
        </nav>
        <div className="sidebar-tip">
          <div className="tip-icon">
            <ShieldCheck size={20} />
          </div>
          <h3>A space for your money.</h3>
          <p>
            This preview uses fictional data. Your real accounts aren’t
            connected.
          </p>
          <span>
            <span className="status-dot" /> Demo workspace
          </span>
        </div>
        <div className="sidebar-bottom">
          <button
            className="theme-toggle"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}{" "}
            {theme === "dark" ? "Light appearance" : "Dark appearance"}
            <span className="toggle-track">
              <span className={theme === "dark" ? "on" : ""} />
            </span>
          </button>
          <div className="profile">
            <div className="avatar">D</div>
            <div>
              <strong>Demo member</strong>
              <small>Personal account</small>
            </div>
            <span className="demo-mini">DEMO</span>
          </div>
        </div>
      </aside>
      <div className="main-wrapper">
        <header className="topbar">
          <div className="breadcrumb">
            <Button
              variant="ghost"
              size="icon"
              className="mobile-menu"
              aria-label="Open navigation"
              aria-expanded={menu}
              onClick={() => setMenu(true)}
            >
              <Menu size={21} />
            </Button>
            <span>My workspace</span>
            <ChevronRight size={14} />
            <strong>{navigation.find((n) => n.id === page)?.label}</strong>
          </div>
          <div className="topbar-actions">
            <span className="demo-pill">
              <FlaskConical size={13} /> Synthetic data
            </span>
            <span className="topbar-divider" />
            <Button
              variant="ghost"
              size="icon"
              aria-label="View upcoming payments"
              aria-expanded={notice}
              onClick={() => setNotice(!notice)}
            >
              <Bell size={19} />
              <span className="notification-dot" />
            </Button>
            <div className="avatar small">D</div>
          </div>
          {notice && (
            <div className="notification-panel">
              <div className="section-heading">
                <h3>Coming up this month</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close notifications"
                  onClick={() => setNotice(false)}
                >
                  <X size={17} />
                </Button>
              </div>
              <Upcoming />
              <p className="muted text-xs">
                Scheduled demo payments, as of 16 November 2026.
              </p>
            </div>
          )}
        </header>
        <main id="main" tabIndex={-1}>
          {!online && (
            <div className="system-banner" role="status">
              <WifiOff size={16} /> You’re offline. The demo workspace is
              available on this device.
            </div>
          )}
          {needRefresh && (
            <div className="system-banner" role="status">
              A new version is ready.
              <Button
                variant="outline"
                onClick={() => void updateServiceWorker(true)}
              >
                Update app
              </Button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR MONEY, AT A GLANCE</div>
              <h1>
                {page === "overview"
                  ? "A little clarity. A lot of possibility."
                  : page === "simulator"
                    ? "Big purchase. Clear perspective."
                    : page === "accounts"
                      ? "Everything has its place."
                      : page === "budgets"
                        ? "Make room for your goals."
                        : "The little details add up."}
              </h1>
              <p>
                {page === "overview"
                  ? "Welcome back. Here’s how your financial world is looking."
                  : page === "simulator"
                    ? "Explore the impact before you make the commitment."
                    : "A thoughtful view of your fictional finance workspace."}
              </p>
            </div>
            <span className="date-pill">
              <CalendarDays size={16} /> {demo.month}
            </span>
          </div>
          {page === "overview" && (
            <>
              <div className="stats-grid">
                <Stat
                  title="Total savings"
                  amount={demo.savings}
                  icon={Wallet}
                  detail="Across your savings & investments"
                  trend="+8.2%"
                />
                <Stat
                  title="Monthly income"
                  amount={demo.income}
                  icon={ArrowDownLeft}
                  detail="Salary & other income"
                  trend="+4.2%"
                />
                <Stat
                  title="Living expenses"
                  amount={demo.expenses}
                  icon={ShoppingBag}
                  detail="78% of your ₹62,500 budget"
                  trend="Within budget"
                />
                <Stat
                  title="Available this month"
                  amount={freeCash}
                  icon={PiggyBank}
                  detail="After living expenses & existing EMI"
                  accent
                />
              </div>
              <div className="dashboard-grid">
                <section className="card cashflow">
                  <div className="section-heading">
                    <div>
                      <h2>Money in, money out</h2>
                      <p>
                        A little more coming in. A little more room to grow.
                      </p>
                    </div>
                    <span className="subtle-pill">Last 6 months</span>
                  </div>
                  <div className="chart-legend">
                    <span>
                      <i className="legend-dot purple" />
                      Income
                    </span>
                    <span>
                      <i className="legend-dot teal" />
                      Expenses + EMI
                    </span>
                  </div>
                  <div
                    className="chart-container"
                    role="img"
                    aria-label="Monthly income and outflows from June to November 2026. November income ₹1,25,000; outflow ₹61,000."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={trends}
                        margin={{ left: -20, right: 10, top: 10, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="incomeFill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#8b77de"
                              stopOpacity={0.23}
                            />
                            <stop
                              offset="100%"
                              stopColor="#8b77de"
                              stopOpacity={0.01}
                            />
                          </linearGradient>
                          <linearGradient
                            id="outflowFill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#7ab6ac"
                              stopOpacity={0.15}
                            />
                            <stop
                              offset="100%"
                              stopColor="#7ab6ac"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          vertical={false}
                          stroke="var(--border)"
                          strokeDasharray="4 5"
                        />
                        <XAxis
                          dataKey="month"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "var(--muted)", fontSize: 11 }}
                          dy={12}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "var(--muted)", fontSize: 11 }}
                          tickFormatter={(v) => `${v / 1000}k`}
                          domain={[0, 160000]}
                          ticks={[0, 40000, 80000, 120000, 160000]}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: 12,
                            color: "var(--text)",
                          }}
                          formatter={(value, name) => [
                            formatMoney(Number(value) * 100),
                            name === "income" ? "Income" : "Expenses + EMI",
                          ]}
                        />
                        <Area
                          isAnimationActive={false}
                          name="income"
                          type="monotone"
                          dataKey="income"
                          stroke="#8b77de"
                          strokeWidth={3}
                          fill="url(#incomeFill)"
                        />
                        <Area
                          isAnimationActive={false}
                          name="outflow"
                          type="monotone"
                          dataKey="outflow"
                          stroke="#7ab6ac"
                          strokeWidth={2.5}
                          fill="url(#outflowFill)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="chart-footnote">
                    <span className="status-dot" /> You’ve kept a positive
                    surplus for 6 months. Keep it going.
                  </div>
                </section>
                <section className="card spending">
                  <div className="section-heading">
                    <div>
                      <h2>Where it went</h2>
                      <p>November living expenses</p>
                    </div>
                    <ShoppingBag size={19} className="muted" />
                  </div>
                  <div className="donut-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          isAnimationActive={false}
                          data={categories}
                          dataKey="amount"
                          innerRadius={67}
                          outerRadius={86}
                          startAngle={90}
                          endAngle={-270}
                          paddingAngle={5}
                          stroke="none"
                          cornerRadius={5}
                        >
                          {categories.map((c) => (
                            <Cell key={c.name} fill={c.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="donut-center">
                      <span>Total spent</span>
                      <strong>{formatMoney(demo.expenses)}</strong>
                    </div>
                  </div>
                  <div className="category-list">
                    {categories.map((c) => (
                      <div key={c.name}>
                        <span>
                          <i
                            style={{ background: c.color }}
                            className="legend-dot"
                          />
                          {c.name}
                        </span>
                        <strong>{formatMoney(c.amount)}</strong>
                      </div>
                    ))}
                  </div>
                </section>
                <div className="dashboard-simulator">
                  <Simulator
                    inputs={purchase}
                    onChange={setPurchase}
                    compact
                    onExpand={() => go("simulator")}
                  />
                </div>
                <section className="card upcoming">
                  <div className="section-heading">
                    <div>
                      <h2>On the horizon</h2>
                      <p>Your upcoming commitments</p>
                    </div>
                    <CalendarDays size={19} className="muted" />
                  </div>
                  <Upcoming />
                  <div className="upcoming-total">
                    <span>Total upcoming</span>
                    <strong>
                      {formatMoney(upcoming.reduce((s, x) => s + x.amount, 0))}
                    </strong>
                  </div>
                  <p className="small-note">
                    Subscriptions are part of your living budget.
                  </p>
                </section>
                <section className="card transactions-card">
                  <div className="section-heading">
                    <div>
                      <h2>A few recent movements</h2>
                      <p>Every transaction tells a little of your story.</p>
                    </div>
                    <Button variant="ghost" onClick={() => go("activity")}>
                      View all <ArrowRight size={15} />
                    </Button>
                  </div>
                  <Transactions limit={3} />
                </section>
                <section className="goal-card">
                  <div className="goal-illustration">
                    <PiggyBank size={38} strokeWidth={1.5} />
                    <Sparkles size={18} />
                  </div>
                  <span className="eyebrow">ONE STEP AT A TIME</span>
                  <h2>A buffer for life’s little surprises.</h2>
                  <p>
                    Your emergency reserve target is {formatMoney(demo.reserve)}
                    . You have {formatMoney(demo.liquidCash)} in liquid cash.
                  </p>
                  <Button variant="outline" onClick={() => go("budgets")}>
                    Explore your goals <ArrowRight size={16} />
                  </Button>
                </section>
              </div>
            </>
          )}
          {page === "simulator" && (
            <>
              <div className="intro-banner">
                <div className="icon-box">
                  <SlidersHorizontal size={22} />
                </div>
                <div>
                  <strong>Your next purchase, in perspective.</strong>
                  <p>
                    Compare all four paths using the same fictional financial
                    snapshot.
                  </p>
                </div>
                <span className="subtle-pill">LIVE PREVIEW</span>
              </div>
              <Simulator inputs={purchase} onChange={setPurchase} />
              <div className="sim-bottom">
                <ShieldCheck size={16} />
                <span>
                  Calculations stay in your browser. No purchase details are
                  saved or sent.
                </span>
              </div>
            </>
          )}
          {page === "accounts" && (
            <>
              <div className="account-grid">
                {accounts.map((a) => (
                  <section className={`account-card ${a.color}`} key={a.name}>
                    <div>
                      <Wallet size={24} />
                      <span>SYNTHETIC</span>
                    </div>
                    <p>{a.name}</p>
                    <h2>{formatMoney(a.balance)}</h2>
                    <small>{a.type}</small>
                  </section>
                ))}
              </div>
              <section className="card account-explainer">
                <div className="icon-box">
                  <ShieldCheck size={24} />
                </div>
                <h2>Your connected life starts here.</h2>
                <p>
                  These are sample accounts. Bank connections, account entry,
                  reconciliation and card statement management are planned for a
                  future phase.
                </p>
                <div className="subtle-pill">No real accounts connected</div>
              </section>
              <section className="card">
                <h2 className="mb-4">Loans & subscriptions</h2>
                <Upcoming />
              </section>
            </>
          )}
          {page === "budgets" && (
            <div className="budget-layout">
              <section className="card">
                <div className="section-heading">
                  <div>
                    <h2>A plan with breathing room</h2>
                    <p>
                      {formatMoney(demo.expenses)} of {formatMoney(6_250_000)}{" "}
                      living budget used
                    </p>
                  </div>
                  <Target size={22} />
                </div>
                {categories.map((c) => (
                  <div className="budget-row" key={c.name}>
                    <div>
                      <strong>{c.name}</strong>
                      <span>
                        {formatMoney(c.amount)}{" "}
                        <small>/ {formatMoney(c.limit)}</small>
                      </span>
                    </div>
                    <progress
                      max={c.limit}
                      value={c.amount}
                      style={{ accentColor: c.color }}
                      aria-label={`${c.name} budget used`}
                    />
                    <small>
                      {Math.round((c.amount / c.limit) * 100)}% used ·{" "}
                      {formatMoney(c.limit - c.amount)} remaining
                    </small>
                  </div>
                ))}
              </section>
              <section className="card">
                <span className="icon-box">
                  <PiggyBank size={24} />
                </span>
                <h2 className="mt-5">Emergency reserve</h2>
                <p className="muted mt-2">
                  Target: {formatMoney(demo.reserve)}
                </p>
                <h3 className="goal-amount">{formatMoney(demo.liquidCash)}</h3>
                <progress
                  max={demo.reserve}
                  value={demo.liquidCash}
                  aria-label="Emergency reserve target fully covered by liquid cash"
                />
                <p className="muted mt-3">
                  Your liquid cash covers the target. This is a comparison, not
                  a separate account allocation.
                </p>
                <div className="demo-note">
                  <FlaskConical size={16} /> Sample budgets and goals are
                  read-only.
                </div>
              </section>
            </div>
          )}
          {page === "activity" && (
            <section className="card">
              <div className="section-heading">
                <div>
                  <h2>November transactions</h2>
                  <p>A sample ledger · 4 fictional entries</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    const csv =
                      "Date,Description,Category,Amount INR\n" +
                      transactions
                        .map(
                          (t) =>
                            `2026-11-${t.date.slice(0, 2)},${t.name},${t.category},${t.amount / 100}`,
                        )
                        .join("\n");
                    const url = URL.createObjectURL(
                      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
                    );
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = "folio-demo-transactions.csv";
                    link.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download size={16} /> Export demo
                </Button>
              </div>
              <Transactions />
              <div className="demo-note">
                <FlaskConical size={16} /> A sample of activity, not a complete
                ledger. Totals won’t reconcile to the dashboard.
              </div>
            </section>
          )}
          <footer>
            <span>
              <ShieldCheck size={13} /> Fictional finances. Real possibilities.
            </span>
            <span>
              Made for a more mindful money life{" "}
              <span className="footer-dot">·</span> Phase 1 preview
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Stat({
  title,
  amount,
  icon: Icon,
  detail,
  trend,
  accent = false,
}: {
  title: string;
  amount: number;
  icon: LucideIcon;
  detail: string;
  trend?: string;
  accent?: boolean;
}) {
  return (
    <section className={`stat-card ${accent ? "accent" : ""}`}>
      <div className="stat-top">
        <span>{title}</span>
        <Icon size={19} />
      </div>
      <h2>{formatMoney(amount)}</h2>
      <div className="stat-trend">
        {trend ? (
          <span>
            <ArrowUpRight size={12} />
            {trend}
          </span>
        ) : (
          <span>
            <ShieldCheck size={12} />
            Ready for your next goal
          </span>
        )}
      </div>
      <p>{detail}</p>
    </section>
  );
}
function Upcoming() {
  return (
    <div className="upcoming-list">
      {upcoming.map((u) => {
        const Icon =
          u.type === "loan"
            ? CreditCard
            : u.type === "subscription"
              ? ReceiptText
              : Cloud;
        return (
          <div key={u.name}>
            <span className={`payment-icon ${u.type}`}>
              <Icon size={18} />
            </span>
            <div>
              <strong>{u.name}</strong>
              <small>{u.detail}</small>
            </div>
            <b>{formatMoney(u.amount)}</b>
          </div>
        );
      })}
    </div>
  );
}
function Transactions({ limit = transactions.length }: { limit?: number }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Transaction</th>
            <th>Category</th>
            <th>Date</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.slice(0, limit).map((t) => (
            <tr key={t.name}>
              <td>
                <span
                  className={`transaction-icon ${t.amount > 0 ? "income" : ""}`}
                >
                  {t.amount > 0 ? (
                    <ArrowDownLeft size={17} />
                  ) : t.icon === "home" ? (
                    <House size={17} />
                  ) : (
                    <ArrowDownRight size={17} />
                  )}
                </span>
                <strong>{t.name}</strong>
              </td>
              <td>
                <span className="category-tag">{t.category}</span>
              </td>
              <td>{t.date} 2026</td>
              <td
                className={`text-right amount ${t.amount > 0 ? "positive" : ""}`}
              >
                {t.amount > 0 ? "+" : "−"}
                {formatMoney(Math.abs(t.amount))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
