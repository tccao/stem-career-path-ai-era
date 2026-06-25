# functions/ — BLAZE REFERENCE ONLY (not deployed on Spark)

This Cloud Functions backend is the original V3 design ([`../../docs/V3-Plan.md`](../../docs/V3-Plan.md),
Rev. 2). **It is not used on the Spark plan** — Spark cannot deploy Cloud Functions.

The **active** Spark/Functions-free backend is:
- enforcement → [`../firestore.rules`](../firestore.rules)
- privileged ops → [`../admin-cli/`](../admin-cli/)
- design → [`../../docs/Spark-Backend.md`](../../docs/Spark-Backend.md)

Keep this directory as the migration target if the project ever moves to Blaze (it restores
the hosted API, triggers, scheduler, and gated Storage). Until then, do not `firebase deploy
--only functions` — it will fail on Spark.
