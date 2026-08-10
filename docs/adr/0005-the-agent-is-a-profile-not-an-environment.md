# 5. An environment is a machine; the agent is a profile the request selects

## Context

An environment carries one `spawnCommand`. It does not carry the rest of the command
line: `server/spawn.ts` composes that itself, always emitting `--name <tab>`, optionally
`--model` and `--remote-control <tab>`, the brief as one positional argument, and resume
as `${spawnCommand} --resume <uuid>`. That vocabulary is Claude Code's. The name of the
binary is configurable; everything corral says to it is not.

So running a second kind of agent on one machine has no supported shape. The only lever
is a second environment id, and that lever misfires twice.

If both entries omit `socket`, they inherit the launching shell's ambient
`HERDR_SOCKET_PATH` and talk to the same herdr. Every pane is then enumerated once per
environment id, with identical pane ids and identical session uuids. `env` is part of
session identity everywhere — correctly, since environments are normally different
machines — so the twins are indistinguishable from two real sessions. Cards bind one of
them; `buildUnassigned` keys its claims by `${link.env}:${link.sessionId}`, so the other
twin is claimed by nobody and sits permanently in the unassigned pool, beside a card that
looks healthy. Observed, not hypothesised.

Pin the sockets and the duplication goes away, but the spawn still fails. `pane run`
types the composed line into the pane, and an agent that does not know the flag exits
before it can register:

```
$ <agent> --name <tab>
error: unexpected argument '--name' found
```

The pane survives at a shell prompt with no agent, so the follow-up attach fails with
`agent target <pane> not found` — an error that names the attach and says nothing about
the flag that caused it.

Operators route around this with a wrapper script named as `spawnCommand`. That works,
and the shortest wrapper — one that discards its arguments and execs the agent bare —
looks like it works best of all: the agent starts, herdr registers it, the card binds.
It also silently drops the brief, silently ignores the model the picker sent, and turns
a resume into a brand-new session, leaving the card pointing at a uuid that no longer
exists and the resumed context unreachable. Nothing reports any of it.

What is *not* wrong here is identity. herdr's integrations report `agent_session` with
`kind: "id"` for other agents as they do for Claude, so a non-Claude pane carries a
stable uuid, binds by uuid, and heals across pane churn like any other session. Only the
Claude-specific enrichment — recap, statusline, registry — stays empty, and that already
degrades on `sessionId === null` rather than on agent kind, so it degrades quietly and
correctly. The gap is the launch vocabulary, and only the launch vocabulary.

## Decision

1. **An environment describes a machine**: its herdr socket, its repositories, its Claude
   config directories. It stops naming an agent. `spawnCommand` is superseded.

2. **An environment declares `agents`** — a map of profile id to profile. A profile holds
   the command and how that command spells each thing corral needs to say: the session
   name, the model, remote control, the brief, and resume. Where an agent has no
   equivalent for one of them, the profile says so and corral omits it rather than
   emitting a flag that aborts the launch.

   Profiles come from the trusted startup config, like everything else in
   `environments.json`. A request selects one **by key**.

3. **`SessionLink` records the profile its session was spawned with**, and resume reads
   it from there — never from an environment default. A card can hold sessions from
   several profiles, so the environment cannot answer this question on the link's behalf.

4. **A profile declares whether it can resume.** For one that cannot, corral offers no
   resume rather than emitting a command that starts a fresh session under the old
   session's name.

5. **An unknown profile key is refused, and the refusal lists the valid keys** for that
   environment, under a dedicated error code — the shape ADR 0004 established for an
   unknown repository, so the MCP tool can re-render that case and no other.

6. **`spawnCommand: X` migrates as a single profile**, so an existing single-agent
   environment keeps working unchanged and untouched config stays valid.

## Rationale

The load-bearing point is 3, and the reason is the failure mode nothing catches. A
mis-spelled launch flag is loud: the agent refuses to start and the attach says so within
seconds. A resume sent to the wrong agent is silent — it starts something, the pane fills
with a working session, and only the uuid disagrees. Recording the profile on the link is
what makes the quiet case impossible, and it cannot be derived later: by the time a
resume is requested, the only evidence of which agent produced the session is the session
itself.

Point 2 chooses a key over a free-form command, and *not* on security grounds. corral
serves an interactive pty over an unauthenticated loopback port; anyone who can ask it to
spawn can already attach to a pane and type. A command string in the request grants no
capability that the product does not already offer by design, and an argument that
pretends otherwise would be theatre. The reasons are mechanical: the picker needs an
enumerable, labelled list, and a link needs an identity that survives an edit to the
flags. A profile key still means the same profile after its command line is corrected; a
stored command string silently stops matching anything.

The wrapper script deserves its own sentence, because it is the status quo and it is not
a smaller version of this design. A wrapper is exactly this translation table, written in
a place corral cannot see, cannot validate, and cannot enumerate — so the picker cannot
list what is installed, an unknown agent produces a shell error instead of a refusal, and
the resume gap above is invisible until someone loses a session to it. Moving the table
into configuration is not new machinery; it is the same table, somewhere the code can
read it.

Point 6 matters more than migrations usually do because it is what keeps the environment
model honest. The reason operators reach for a second environment id is that the first
one can hold only one agent; remove that constraint and the duplicate-environment
workaround has no remaining use. That in turn makes two local environments resolving to
one socket unambiguously a mistake rather than a technique — worth a companion preflight
refusal, since the machinery is already there (`unpinnedLocalIds`) and today's warning
only fires when corral is launched from inside Claude Code, which is not when this
happens.

## Rejected alternatives

**Deduplicate live sessions by uuid across environments.** The most direct fix for the
visible symptom, and the wrong layer. The duplicate is not a data condition to normalise
but a contradiction in configuration: two ids asserting they are different machines while
being one herdr. Collapsing them requires choosing a winner, and `env` is the routing key
for attach, close, resume, upload and spawn — with profiles that differ per environment,
an arbitrary winner sends actions to the wrong configuration silently. A partial dedupe
confined to the unassigned pool is worse than none: the list becomes honest while the
poller still double-polls and the fleet view still double-counts. It also widens an
invariant the code states deliberately — uuid uniqueness is assumed *per environment* —
and so removes the ability to tell a genuine cross-environment collision from a
misconfiguration.

**One environment per agent kind, with pinned sockets.** This is the status quo made to
work, and it does work: separate sockets, separate fleets, no duplication. It also
requires one herdr server per agent per machine, doubles the poll traffic for panes that
sit side by side, and splits one machine's work across two columns of the UI for a reason
that is an implementation detail. The model already says an environment is a machine;
this alternative asks the operator to pretend otherwise.

**A free-form command in the spawn request.** Grants nothing corral does not already
grant, so it is not refused on principle — see the Rationale. It is declined as the
*primary* interface because the picker cannot enumerate it and a link cannot durably
identify it. It remains available later as an escape hatch for local environments, if a
use appears that a profile cannot express. The remote path would need its own answer
first: a request-supplied command reaches the far shell through `ssh <host> '…'`, where
the quoting rules the repository holds deliberately have no obvious reading for a string
that is itself a command line.

**Detect the agent and adapt.** Probe `--help`, match the flags, build the line. Turns a
declaration into an inference that runs at spawn time, against output that changes with
every upstream release, and fails by composing a plausible wrong command rather than by
saying it does not know. The configuration file is where corral already keeps facts it
cannot derive.

**Leave it to wrapper scripts and document them.** Cheapest, and it is what people
already do. It keeps the resume gap permanently: no wrapper can distinguish a resume that
corral means from a fresh spawn, because by the time the arguments reach the wrapper the
distinction is a flag the agent does not understand. Documenting a workaround whose
failure mode is losing a session's context is not a decision this record is willing to
call finished.
