import "@/core/config/load-env-file";

import { runJobFromCli } from "@/jobs/run-job";

void runJobFromCli("receipt-processing");
