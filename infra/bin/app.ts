import { App } from "aws-cdk-lib";
import { buildApp } from "../lib/app";

// Personal account; region pinned here because the dev desktop defaults AWS_REGION to us-west-2.
buildApp(new App(), { account: "334772842524", region: "us-west-1" });
