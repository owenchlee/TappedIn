// Reads the posting text of every open job and re-scores them all. The daily refresh does this a
// few minutes at a time; this catches up a whole backlog in one go (e.g. right after deploying).
//
//   npm run jobs:details                 # every job not read yet, then re-score everything
//   npm run jobs:details -- --rescore    # only re-score (after changing the scoring rules)
//   npm run jobs:details -- --minutes 10 # stop after 10 minutes
import "dotenv/config";
import { refreshDetails, rescoreJobs } from "@/lib/fit/store";

async function main() {
  const args = process.argv.slice(2);
  const minutesAt = args.indexOf("--minutes");
  const minutes = minutesAt >= 0 ? Number(args[minutesAt + 1]) : 60;

  if (!args.includes("--rescore")) {
    console.log("Scoring jobs that have no score yet...");
    await rescoreJobs({ onlyUnscored: true });
    console.log(`Reading postings (up to ${minutes} min)...`);
    const summary = await refreshDetails({ budgetMs: minutes * 60_000, log: (m) => console.log(`  ${m}`) });
    console.log(summary);
  }
  const n = await rescoreJobs();
  console.log(`Re-scored ${n} jobs.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
