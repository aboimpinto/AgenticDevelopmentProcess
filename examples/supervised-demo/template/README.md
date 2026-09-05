# HEPHA Supervised Demo

This synthetic, documentation-only project demonstrates how HEPHA turns an
ambiguous feature into explicit human decisions. It is not an application and
must not be deployed.

## Human-control boundary

An agent may analyze the supplied EPIC and FEAT, recommend alternatives, and
update the FEAT after the operator answers. It may not invent answers, begin
implementation, create external resources, or perform Git writes without the
operator's explicit instruction.

Run `npm run verify` to confirm that the example still contains the expected
portable product artifacts after a Deep-Dive.
