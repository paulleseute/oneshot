import { createMovie, step1, step2, step3, step4, step5, step6 } from "./index";
import * as path from "path";

const args = process.argv.slice(2);

async function main() {
  // Full run: pnpm app "description"
  if (args.length && !args[0].startsWith("--step")) {
    const description = args.join(" ").trim();
    console.log(`\nCreating movie: "${description}"\n`);
    await createMovie(description);
    return;
  }

  // Single step: pnpm app --step 2 --id 1771624564459
  const stepIdx = args.indexOf("--step");
  const idIdx = args.indexOf("--id");
  if (stepIdx === -1 || idIdx === -1) {
    console.error("Usage:");
    console.error('  pnpm app "describe your movie"');
    console.error("  pnpm app --step <1-6> --id <timestamp> [description]");
    process.exit(1);
  }

  const stepNum = parseInt(args[stepIdx + 1]);
  const outDir = path.join("temp", args[idIdx + 1]);

  switch (stepNum) {
    case 1: {
      const desc = args.filter((_, i) => i !== stepIdx && i !== stepIdx + 1 && i !== idIdx && i !== idIdx + 1).join(" ").trim();
      if (!desc) { console.error("Step 1 requires a description"); process.exit(1); }
      step1(outDir, desc);
      break;
    }
    case 2: await step2(outDir); break;
    case 3: await step3(outDir); break;
    case 4: await step4(outDir); break;
    case 5: await step5(outDir); break;
    case 6: step6(outDir); break;
    default: console.error("Step must be 1-6"); process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
