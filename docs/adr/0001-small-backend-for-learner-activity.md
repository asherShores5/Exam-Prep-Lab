# 0001: Add a small backend to record Learner Activity

Date: 2026-11-02. Status: accepted.

## Context

Until now the site was fully static: exam banks were JSON files and all study data lived in the browser's localStorage. The owner shares the site with coworkers and wants to see who uses it, which exams they study, and how they score. A static site can't do this, because data entered in a browser never leaves that browser.

## Decision

- Keep site hosting on Amplify.
- Add a separate CDK app in us-west-1 with:
  - an unauthenticated, throttled, validated write API that records Activity;
  - a DynamoDB table holding Learners and their Activity, kept indefinitely;
  - a Cognito pool with one user (the owner) that guards a read API for the Admin Page.
- A Learner is a typed name plus a random per-browser ID. There's no login.
- Learners must enter a name on their first visit. The site shows no notice about data collection; the owner chose this.
- The backend deploys from GitHub Actions through OIDC. Each deploy waits for the owner's approval in a protected `production` environment.

## Alternatives rejected

- **Stay static and store the name locally.** Gives no usage data.
- **Counts only, no names.** The owner wants to know who is using it.
- **A local CLI report instead of an Admin Page.** Safer, but the owner wants to check usage from a phone.
- **Move hosting to CDK S3/CloudFront.** It would mean a DNS cutover for no gain right now.
- **Amplify Gen 2 backend.** It differs from the owner's other apps.

## Consequences

- The site now needs network access to record Activity. Studying still works offline, and Activity that can't be sent may be lost or queued.
- The write endpoint is public, so anyone can submit fake Activity. Throttling and input caps limit the damage, but the data is only trustworthy enough for rough usage tracking.
- Names and scores of real people are stored indefinitely in the owner's AWS account. Only the owner can read them.
