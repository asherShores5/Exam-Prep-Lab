import { CfnOutput, Duration, Stack, type StackProps, aws_iam as iam } from "aws-cdk-lib";
import type { Construct } from "constructs";

export const GITHUB_REPO = "asherShores5/Exam-Prep-Lab";
/** GitHub Environment the deploy job runs in; it requires the owner's approval (set in GitHub). */
export const DEPLOY_ENVIRONMENT = "production";
export const DEPLOY_ROLE_NAME = "exam-prep-lab-github-deploy";

/**
 * GitHub Actions -> AWS via OIDC (no stored keys). Only jobs in this repo's `production`
 * environment can assume the role, and the role can only assume the CDK bootstrap roles.
 *
 * The account's GitHub OIDC provider already exists (HoneyDo's CI stack created it; an account
 * can have only one per URL), so it is imported, not created.
 */
export class CiStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    const provider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      "GitHub",
      `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`,
    );
    const role = new iam.Role(this, "DeployRole", {
      roleName: DEPLOY_ROLE_NAME,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": `repo:${GITHUB_REPO}:environment:${DEPLOY_ENVIRONMENT}`,
        },
      }),
    });
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: [`arn:aws:iam::${this.account}:role/cdk-hnb659fds-*`],
      }),
    );
    new CfnOutput(this, "DeployRoleArn", { value: role.roleArn });
  }
}
