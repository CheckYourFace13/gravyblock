// Read-only combined House Accounts portfolio report. Prints it; writes and sends nothing.
//   tsx --env-file=/home/deploy/gravyblock/.env scripts/ops/portfolio-report.ts [--days 7]
import { gatherPortfolioReport, renderPortfolioReport } from "../../src/lib/reporting/portfolio-report";

const i = process.argv.indexOf("--days");
const days = i > -1 ? Math.max(1, Math.min(90, Number(process.argv[i + 1]) || 7)) : 7;
gatherPortfolioReport(days)
  .then((r) => { console.log(renderPortfolioReport(r)); })
  .catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; })
  .finally(() => setTimeout(() => process.exit(), 200));
