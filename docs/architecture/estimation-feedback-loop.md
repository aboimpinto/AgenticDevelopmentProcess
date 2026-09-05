# Estimation Feedback Loop

Hepha keeps prediction, execution, and interpretation as separate evidence.
Original Start Feature estimates are never rewritten after execution. Persisted
agent start/end timestamps remain the source for actual AI execution time.

## Delivery Levels

- Phase: original Human/AI estimate plus the sum of completed attempts for that phase.
- FEAT: sum of numbered phase estimates plus all completed implementation-workflow agent runs, including routing, review, repair, recovery, and verification work.
- EPIC: sum of comparable completed linked FEAT measurements.
- Project: sum of comparable completed FEAT measurements across the project.

A FEAT is comparable only when it is implementation-complete and has complete
Human estimates, AI estimates, and persisted completed agent timing. Incomplete
work never influences calibration ratios or estimated productivity gain.

## Measures

- Estimated human time saved is `human estimate midpoint - actual AI execution`.
- Estimated delivery acceleration is `human estimate midpoint / actual AI execution`.

The delivery dashboard always compares estimated competent-human delivery with
measured AI execution. AI prediction variance and midpoint error remain
internal calibration evidence for future Start Feature estimates; they are not
presented as delivery performance or business-value KPIs.

Human time saved is explicitly an estimate. It is not a timesheet measurement
and must not be presented as invoiced or audited labor savings.

## Prediction Feedback

Before Start Feature post-processing estimates a new FEAT, Hepha supplies a
bounded set of comparable completed FEATs from the same project. The context
includes each original AI range, actual execution, phase count, human range,
the median actual-to-predicted midpoint ratio, and mean absolute prediction
error.

The LLM must start from the new scope and use history as calibration evidence.
It must explain material divergence caused by scope, phase count, model,
verification load, or uncertainty. It must never copy a historical duration or
blindly apply one project-wide multiplier.

Calibration and retrospective generation are advisory, best-effort enrichment.
Missing, incomplete, or malformed historical timing evidence falls back to an
explicit unavailable message and must never fail Start Feature or Complete
Feature. Required phase estimates are still validated independently because
they are part of the Start Feature output contract.

Complete Feature adds an estimation retrospective to the completion report. It
receives deterministic original/actual/variance evidence and may analyze likely
causes, but causal explanations must remain labelled as analysis. The resulting
recommendation complements LessonsLearned and informs later Start Feature runs.
The retrospective leads with human-versus-actual-AI delivery gain; AI-estimate
error belongs only to the internal calibration subsection.
