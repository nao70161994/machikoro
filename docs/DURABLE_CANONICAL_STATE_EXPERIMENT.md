# Durable Canonical State Experiment

This branch contains an opt-in file adapter experiment. It is not approved for production or main.

- The default remains `noop`; only `CANONICAL_STATE_STORE=file` enables disk writes.
- `memory` is process-local and is not durable.
- The file adapter assumes one host and one local filesystem. It does not coordinate multiple instances or shared volumes.
- An ephemeral deployment disk does not provide restart durability. Persistent volume provisioning, capacity limits, backup, restore drills, and monitoring remain operational prerequisites.
- The journal, checksum, revision/CAS, lease, and lock behavior has pure filesystem coverage here, but server canonical transactions and restart persistence remain separate high-risk work.
- Stream/watermark protocol changes and non-host canonical replacement are not part of this adapter experiment.

Do not merge this branch into main. A future adoption must keep explicit opt-in, validate storage operations in the target hosting environment, and complete restart and multi-process failure tests.
