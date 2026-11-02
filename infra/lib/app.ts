import { type App, Tags } from "aws-cdk-lib";
import { APP_TAG, ApiStack } from "./api-stack";
import { CiStack } from "./ci-stack";
import { EXAM_INDEX_PATH, loadKnownExamIds } from "./exams";

export interface BuildOptions {
  /** Left out in tests so templates synth as a fresh checkout would. */
  account?: string;
  region: string;
  examIndexPath?: string;
}

export interface BuiltApp {
  api: ApiStack;
  ci: CiStack;
}

export function buildApp(app: App, opts: BuildOptions): BuiltApp {
  const env = { account: opts.account, region: opts.region };
  Tags.of(app).add("app", APP_TAG);
  const api = new ApiStack(app, "ExamPrepLabApi", {
    env,
    description: "Exam Prep Lab: Learner Activity API (ADR 0001)",
    knownExamIds: loadKnownExamIds(opts.examIndexPath ?? EXAM_INDEX_PATH),
  });
  const ci = new CiStack(app, "ExamPrepLabCi", { env, description: "Exam Prep Lab: GitHub OIDC deploy role" });
  return { api, ci };
}
