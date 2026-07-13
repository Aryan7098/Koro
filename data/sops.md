# EchoStand SOPs — MetLife Stadium (Demo Corpus)

These are organizer-approved procedures used to ground the rendering layer.
Each `## SOP: <title>` block is one entry loaded into the `sops` table.
The `category:` line drives category-based RAG retrieval.

## SOP: Spill on concourse or seating bowl
category: spill

If a spill is reported (drink, food, or unknown liquid):
1. Dispatch nearest janitorial crew (est. 4–6 min).
2. Cordon the area with two staff or a warning sign until dry.
3. If the substance is unknown or the area is >2m², page a supervisor.
4. Fan-facing message: acknowledge, redirect to the next-nearest same-type destination (restroom → nearest open restroom; vendor → nearest open vendor); reassure that crew is en route with ETA.
5. Resolution: when the concourse is dry and reopened, mark resolved and notify all reporters.

## SOP: Medical incident (any severity)
category: medical

Any medical report is safety-critical.
1. Immediately surface to the on-shift medical supervisor (Medical Station North or South, whichever is closer).
2. Do not wait for corroboration — a single credible report is enough to dispatch a first responder.
3. If reported symptoms include unconsciousness, chest pain, severe bleeding, or seizure, dispatch AED-equipped team from the nearest medical station and call EMS.
4. Fan-facing: do NOT publish medical details. Only nudge nearby fans if the area needs to be cleared (e.g. "please give first responders room, alternate route to Section 112 via West Concourse").
5. Log every dispatch and outcome to the ledger for post-match review.

## SOP: Gate closure or wait spike
category: gate

If a gate is reported closed, delayed, or overwhelmed:
1. Verify with the gate's throughput sensor (passive signal) before broadcasting closure. If sensor disagrees, treat as Rumor.
2. If verified: redirect approaching fans to the two nearest same-quadrant gates; balance load between them.
3. Fan-facing message must name a specific alternative gate and include an updated ETA.
4. Escalate to Operations if the delay exceeds 10 minutes or the wait line spills into public roadway.

## SOP: Security concern (unattended item, verbal threat, weapon report)
category: security

Safety-critical.
1. Any weapon report or credible threat surfaces to the Operations Lead + on-site law enforcement immediately, regardless of corroboration.
2. Do not publish to fans — silent handling only.
3. Unattended-item reports: dispatch bomb squad protocol; nearby fans redirected via emergency exit routes without stating cause.
4. Do not resolve without Operations Lead sign-off.

## SOP: Structural / fire / evacuation
category: structural

Safety-critical.
1. Any fire, smoke, or structural report is dispatched immediately with human authorization.
2. Fan-facing evacuation messages are pre-approved templates only — never freely generated. The rendering layer must select from the template set.
3. Accessibility: evacuation instructions MUST re-plan against step-free routes for fans with mobility profiles. Never send a wheelchair user to a stairwell exit.

## SOP: Wayfinding / can't find X
category: wayfinding

Low-severity by default.
1. Ground the response strictly in the Venue Graph — never invent a location.
2. Give one specific next-node instruction and an ETA in the fan's language.
3. If the fan has a mobility or sensory accessibility profile, re-plan the route through step-free / low-stimulus edges before rendering.
4. If the request cannot be resolved from the graph (unknown landmark), respond "UNCERTAIN — please ask nearest volunteer" rather than guess.

## SOP: Restroom failure
category: restroom

1. Dispatch janitorial to inspect. Confirmed failure → mark restroom `is_open=false` in venue state.
2. Redirect fans to the nearest open same-level restroom, respecting accessibility profiles (family / step-free preserved).
3. Do NOT redirect to a restroom the graph says is closed — always re-query current state before rendering.

## SOP: Crowd surge / density spike
category: crowd

1. Cross-check with passive density feed for the location; if density > 4/m² and rising, escalate.
2. Deploy volunteers to visually confirm; volunteer confirmation raises confidence to CONFIRMED.
3. Fan-facing messages avoid amplifying panic — instruct calmly toward the least-loaded adjacent concourse per the graph.

## SOP: Smell / air quality
category: smell

1. Low severity unless the smell is smoke, gas, or chemical — those escalate to structural/security procedures.
2. For food/waste smells: nearest janitorial + ventilation check.

## SOP: Loop-closure notification
category: closure

When a staff member marks an event resolved:
1. Every distinct reporter receives a short "fixed, thanks — took N minutes" nudge in their language.
2. If the fan is still near the affected node, include a "you can go back / route restored" hint referencing the graph.
3. Log the notification count to the ledger for the success metrics endpoint.
