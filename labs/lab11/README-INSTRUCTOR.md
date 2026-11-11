# Week 11 — Exemplar Submission (Final Project Proposal)

This is a **model submission**.  It is not a template to copy: a proposal for *your* project will look
different in content. What should match is the level of specificity.

## Contents

```
project/
  PROPOSAL.md        Part A -- all seven sections, in order, with the required headings
   spike/
    spike.js         Part B -- the 90-minute risk prototype (run: node spike.js)
    output.txt       its actual output, committed
    FINDINGS.md      what was learned and what changed in the scope as a result
```

## Common gaps this exemplar is meant to expose

| If your proposal… | …compare against |
|---|---|
| says "I'll check energy is conserved" | §4 Test 1 — quantity, regime, number, tolerance |
| has a MUST tier with four or more features | §3 — eight items, seven of which already work |
| has a spike that "worked, so nothing to report" | FINDINGS.md — the limits found, not the success |
| justifies the integrator as "Verlet is best" | §2 — *and* where Verlet tells you nothing |
| has a fallback of "start earlier / work harder" | §5 — a different shippable product |

## Honest caveats

The spike's Test 2 energy drift (0.627 %) is a genuine limitation of frame-time contact
resolution, not a bug that was left in. The exemplar reports it and sets its tolerance
around it. You are expected to do the same with whatever your own prototype turns up —
a known, measured, documented limitation costs you nothing, an unmeasured one costs you
the validation section in Week 13.
