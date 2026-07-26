# Product Design

This document is the source of truth for Oshikatsu product decisions.

# Part I: Product Design

## "Oshikatsu" From the User's Perspective

> Gather together around newly released manga, support your favorites together, find people with similar Oshi, discover interesting manga through those people, read even more manga, and build excitement by supporting even more manga. Other people see that excitement, find more manga to support, and the excitement grows even further.

This is the purpose of Oshikatsu.

It creates a place to share the atmosphere of people who have just read the same thing within the same limited window of time: surprise, laughter, uncertainty, and tears. The primary purpose is **to enjoy reading the manga that came out today with the people who are there today**. Oshikatsu protects "shared time in which humans are participating."

Everyone shares the same time and shares their "Oshi" with one another.
```text
The latest chapter of a manga is released every week on a specific day at a specific time
-> Latest chapters from multiple manga are released at the same time
-> The corresponding Room opens in Oshikatsu. The Room contains multiple manga
-> Readers gather in the Room and "support" them (= share their impressions with one another). Support methods include stamps (emoji such as "🔥 Peak Chapter", "😭 Cried My Eyes Out", "🥺 Too Precious", "🐉 Next Chapter Now", "👑 Chapter of the Week", "💡 I'm Dead", "🤗 I Melted", "🐻‍❄️ Emotionally Wrecked", "🌋 I'm Losing It") and shouts (such as "Thank you, author!! I can't survive until next week", "This chapter is too peak!!!!!", "My emotions exploded"). Your own support and other people's support are reflected in the Room in real time, creating excitement. To share the same time, the Room is closed after several hours
-> Furthermore, everyone's support is used to create the next excitement
   - If the Room does not contain the manga you want to support, anyone can add one as a Nominee only before voting starts. After voting starts, the candidate set does not change
    - After a certain amount of time has passed since the manga release, the Room is SEALed, and the manga with the most support at that point are announced in the rankings
    - When the Room is SEALed, achievements are granted to people who supported specific manga
        🥇 First Place Achieved: Granted to people who supported the specific chapter of the manga that placed first in the Room
        💎 Hidden Gem Scout: Granted to people who were among the first to support the manga that placed first in the Room in that round
        🔥 Long-Run Supporter: Granted according to the number of consecutive rounds in which the person joined the Room
        ✏️ Vote Count: Granted when a person joins the Room
    - Special Rooms are opened several times a year. These are not support for manga, but "support" for people participating in Oshikatsu. In this Room, everyone supports people
        🏆 Finalist: A person who contributed to manga culture
-> By viewing one another's profiles and seeing the manga that people with many achievements support in Rooms, Readers discover new "Oshi". Reading those manga makes Oshikatsu progress even further
```

A mechanism where someone's desire to spread the word about good manga reaches people who want to read good manga.
In Web2 comments, multiple posts are possible and posting is costless, so spaces tend to become disorderly. In addition, results can be manipulated by the organizer so that manga a publisher wants to sell rises in the rankings, and voting periods can be arbitrarily expanded or shortened. Because Oshikatsu does not allow these things, it should become a place where high-quality, genuine comments gather more easily.

Anyone can open a Room. In the Hackathon demo, a manifest is created from the Room creation UI. In production as well, Room start and end conditions are determined by the fixed `opensAt` and `deadline` in the manifest, and the organizer cannot change them later.

## Shout is the Vote

Oshikatsu does not show users a separate `Ballot` action in addition to Shout. **Choosing a work or person, adding a Reaction and a short message, and sending that Shout is the Vote in that Room.** A Reaction by itself is not a Vote. The latest Mirror-confirmed Shout is that participant's current intent.

On the first Shout in each Room, the participant proves that they are one human with World ID. The Room, nominee, Hedera account, Shout intent, and World anchor are bound into the same Evidence. Canonical World Evidence is committed into the HCS event through a public reference and SHA-256 digest, so a third party can later replay verification against the fixed World state. HCS and Mirror are the source of truth for the Shout's exact bytes, payer, consensus order, and before-or-after-deadline status.

The names `Ballot` and `Ballot v2` that remain in existing code and protocol fixtures identify the internal wire envelope carrying the Protected Shout's World Evidence commitment. They are not a second voting action performed separately from Shout. When later technical sections say `initial ballot`, `update`, or `withdraw`, they mean the first Protected Shout, an update to the current intent expressed by Shout, or withdrawal of that current intent. This section overrides later UI wording or legacy explanations that say a Shout does not change the vote.

## "Oshikatsu" From the Hack Perspective

> A pseudonymous voting system using Crypto for Sybil Resistance. By including World ID Orb-backed Proof of Human credential issuance in the trust boundary and combining World ID with HCS, it realizes a foundation for fair online voting essential to democracy: only votes that reach HCS consensus within the voting Window are valid; the last vote submitted by a specific person is treated as the valid vote; one person gets one vote per Room; the voter is proven human by Orb while the vote itself is pseudonymous (a Wallet address is not a real-world Identity); aggregation is third-party Verifiable and there is assurance that results were not manipulated by the vote organizer; the vote itself has a tiny cost, which can exclude meaningless votes such as random voting; anyone can hold a vote in a public place and anyone can stand as a candidate before voting starts.

The path from human proof to vote establishment is fixed as the following single route.

```
Connect Hedera Wallet (HashPack)
    -> Choose the work or person to support in the Room and create a Shout with a Reaction and short message
    -> Generate a commitment and World signal bound to the Room, nominee, Shout intent, and Hedera Wallet
    -> Only on the first Shout for that Room, obtain human proof with World ID v4
   -> Using an anchor block that satisfies the World Chain freshness condition and the official WorldIDVerifier, verify the proof before submission
    -> If the proof is valid, save the raw World proof to public content-addressed evidence storage
        -> The Wallet owner directly posts a Protected Shout envelope of 900 bytes or less to HCS, binding the Shout, proof digest, and immutable evidence reference
    -> Obtain the single-message HCS event from Mirror Node and verify the exact bytes
   -> Wait until the anchor block is finalized on World Chain
  -> Using the same historical state on World Chain fixed at voting time, third parties also re-verify the World proof
    -> For the same Room and same World nullifier, grant the Room capability only to the first Protected Shout established on HCS
    -> After obtaining the capability, do not request World ID again; post Shout updates and withdrawals from the same Hedera Wallet to HCS
   -> For the same capability, adopt the last HCS event completed before the manifest deadline as the official voting state
   -> After the deadline, post an authority-authenticated SEAL and finalize the results up to the fixed deadline
```
Human proof by World ID is requested only once, on the first vote for each Room.

World ID requests use the v4 `proofOfHuman` preset with `allow_legacy_proofs=false`. This limits initial voting to people who have a World ID v4 Proof of Human credential backed by Orb anonymous biometric authentication. In Oshikatsu, "human" and "one person, one vote" are established with this World credential issuance and the official World verifier included in the trust boundary.

Behind the scenes, each Room is an independent voting event. Therefore, World ID is not used to create a permanent user ID across all of Oshikatsu, but to allow one human to obtain exactly one voting qualification in each Room.

Room A
  -> Perform World ID once on the initial vote
  -> Obtain the capability for Room A
  -> Update or withdraw any number of times with the same Wallet until the deadline

Room B
  -> Perform World ID once again on the initial vote
  -> Obtain the capability for Room B
  -> Update or withdraw any number of times with the same Wallet until the deadline

World ID is not requested every time the ranking is changed within the same Room. The World proof is used only to obtain the initial Room capability, and subsequent operating authority is treated as the Room capability fixed to the Hedera Wallet.

This protocol observes the following three principles.

1. World ID is used to establish one qualification per person per Room.
   Orb-backed World ID v4 Proof of Human is requested only once on the initial vote for each Room. The first initial ballot with a valid proof is granted the Room capability, and World proof is not requested again for subsequent vote updates or withdrawals.
2. Separate the responsibilities of World Chain and Hedera.
    The official WorldIDVerifier on World Chain guarantees the validity of the human proof and nullifier. The Hedera Wallet indicates the voter's own intent, and HCS becomes the source of truth for the poster, posting order, vote updates, withdrawals, and before/after-deadline status. The Oshikatsu backend does not sign the formal validity of human proof.
3. Distinguish invalid proofs from unverifiable proofs.
    If WorldIDVerifier rejects the proof, it is INVALID. By contrast, if verification cannot be completed because historical state cannot be obtained or block hashes do not match across archive RPCs, it is UNVERIFIABLE. An UNVERIFIABLE initial ballot is not granted a Room capability.

The state transition for an initial vote is as follows.
```
DRAFT
  Editing the ranking in the Room

  -> PROOF_ACQUIRED
     World proof bound to the Room, ranking, deadline, and Wallet has been acquired

  -> PREFLIGHT_VALID
     Proof has been verified before submission at the World Chain anchor block. The anchor may not yet be finalized

  -> SUBMITTED
     The Wallet owner has sent the initial ballot to HCS

  -> MIRROR_CONFIRMED
      Single-message exact bytes, payer, and consensus metadata have been confirmed from Mirror Node

  -> RECORDED_UNVERIFIED
      The Mirror-confirmed ballot has been recorded to the public projection, but World historical verification is not complete

  -> WAITING_WORLD_FINALITY
     Waiting until the World anchor block fixed at voting time is finalized

  -> VALID
     World proof, ballot hash, signal, Hedera payer, and deadline condition are all valid

  -> INVALID
     Verification of proof, hash, payer, deadline, or other conditions failed

  -> UNVERIFIABLE
     Historical state or other required data cannot be obtained, so third-party verification cannot be completed

  -> CAPABILITY_GRANTED
     The ballot is VALID and there is no prior capability for the same Room and same nullifier

  -> NULLIFIER_CONFLICT
     The ballot is VALID, but a capability for the same Room and same nullifier already exists
```

VALID means that the World proof and voting information included in the initial ballot are correct.

CAPABILITY_GRANTED further means that the one-person-one-qualification condition for that Room has been satisfied, and that the Hedera Wallet is now able to update or withdraw the vote.

In the UI, "voted" is displayed not at the SUBMITTED point when sending to HCS is complete, but at the CAPABILITY_GRANTED point when public verification and nullifier conflict determination are complete.

RECORDED_UNVERIFIED is an optimistic receipt and does not represent vote establishment or capability grant. Reader may display "Recorded on Hedera; awaiting verification," but it must not use this for success expressions, official vote counts, or update/withdraw authority.

## Optimistic Ranking and Later Verification

While waiting for World anchor finality or historical verification, Reader can display a provisional Ranking from ballots recorded on HCS. The provisional Ranking and verified Ranking are folded separately from the same public event set, the same cutoff, and the same explicit policy.

| verification state | Provisional Ranking | Verified Ranking | capability |
|---|---:|---:|---:|
| `RECORDED_UNVERIFIED` | Include | Do not include | Do not grant |
| `UNVERIFIABLE` | Include | Do not include | Do not grant |
| `VERIFIED` / `VALID` | Include | Include | Subject to uniqueness determination |
| `INVALID` | Do not include | Do not include | Do not grant |

For each Ranking, the current intent of the same payer is determined by folding only the events included in that Ranking in HCS sequence order. If a subsequent event is still UNVERIFIABLE, the provisional Ranking can adopt that subsequent event, while the verified Ranking can adopt the immediately preceding VERIFIED event. If the subsequent event is confirmed INVALID, it is excluded from both, and the fold returns to the immediately preceding valid event. Firestore arrival order, verification completion order, and API time do not determine ranks.

The provisional Ranking is always displayed as `Provisional`, and the counts of unverified, unverifiable, and verified events, the policy ID, cutoff, and result hash are shown together. If the scoring policy is not fixed to the Room manifest or versioned protocol, the verified side is also a `Verified preview`, not the Final Ranking. Official SEALed results use only the verified Ranking reproduced from the manifest-bound policy and fixed cutoff.

Oshikatsu does not need to reimplement OP Stack fault proofs, challenge games, bonds, or slashing for this optimistic display. Oshikatsu consumes the finality of the fixed World anchor and the historical verifier call, then refolds the same event log from verification observations obtained later.

## Voting Window and Candidate Set

The Room manifest fixes at least `roomId`, `opensAt`, `deadline`, the Nominee list, ballot topic, World RP ID, and World action.

Only Nominee addition events that reach HCS consensus before `opensAt` are valid. Nominee additions at or after `opensAt` are invalid in the public fold even if recorded on HCS. This prevents the candidate set for the ranking from changing during voting.

Initial votes, updates, and withdrawals are limited to single-message HCS events, and are judged to be inside the Window only if the message satisfies the following.

```text
manifest.opensAt
    <= event consensus timestamp
   <= manifest.deadline
```

Chunked events are invalid as protocol violations. Events that reach HCS consensus after `deadline` are also invalid. The deadline is determined by the manifest `deadline`, not by the posting time of the SEAL.

## HCS single-message payload budget

For Oshikatsu wallet-signed events, the application limit is 900 UTF-8 bytes against the HCS network limit of 1,024 bytes. The remaining 124 bytes are reserved as safety margin and are not used for future schema expansion or encoding differences.

- Byte count is measured as UTF-8 bytes equivalent to `TextEncoder`, not JavaScript string length.
- Events exceeding 900 bytes are rejected before opening the wallet.
- `TopicMessageSubmitTransaction` uses `setMaxChunks(1)`, and chunk groups are not sent as formal events.
- Canonical encoding and field limits are fixed by protocol version.
- Reaction sends only predefined stamp IDs and does not duplicate display labels or assets in the payload.
- Shout body is limited to 200 Unicode code points, and the body alone is limited to 600 UTF-8 bytes.
- The canonical Shout event carries the displayed Shout body. The internal Evidence envelope (legacy wire name `Ballot v2`) does not duplicate the body; it carries the selected nominee or ranking, World proof digest, immutable evidence reference, and World anchor. It is not a separate vote, but the commitment that makes the same Shout Vote replay-verifiable later.
- Raw World proof, images, AI output, and display metadata are not stored directly on HCS.

Even if all 200 characters are 3-byte Japanese characters, the body is 600 bytes. The worst-case fixture for the JSON envelope, including Room ID, event ID, and stamp ID, must be 900 bytes or less. If emoji or combining characters exceed the UTF-8 limit, input is rejected even if it is 200 characters or fewer.

The World evidence artifact must be publicly and immutably retrievable, and must match the digest recorded in the HCS event byte-for-byte. Even when the content-addressed URI itself includes the digest, an explicit SHA-256 digest is retained as a protocol field.

The artifact is limited to bytes encoded canonically from a versioned allowlist schema. It includes only fields required for public verification of the World proof, and does not include transport metadata, device information, access tokens, headers, images, biometric information, World username, or display metadata. Unknown fields are not automatically published; they are reviewed as schema version updates.

The artifact publisher does not determine formal validity. Before requesting an HCS signature from HashPack, the client anonymously retrieves the artifact again from the reference that will be recorded to HCS, and verifies the canonical schema, SHA-256 digest, Room action, signal, ranking, anchor, and binding to the connected Hedera account. A ballot that does not match the published artifact is not passed to the wallet. It is acceptable for an unreferenced artifact to remain after wallet rejection.

Third-party verifiers use only the reference recorded on HCS as authority, and do not trust alternative URIs or verification results later presented by the backend. A fresh process retrieves the artifact, recalculates the digest and binding, checks the Mirror payer, and re-executes historical verification at the fixed World block. The Oshikatsu backend's `VALID` response alone does not grant capability.

If the artifact cannot be retrieved, multiple resolvers disagree, or matching committed bytes cannot be determined, classify it as `UNVERIFIABLE`. The mere fact that a retrieval source returned different bytes does not make the World proof `INVALID`. It is `INVALID` only when the canonical artifact committed by HCS can be retrieved and the artifact's own schema, binding, proof, or historical verification fails.

The digest guarantees integrity but not availability. Storage destination, pinning, retention, independent replicas, and verification horizon are selected in Issues, and the initial ballot slice is not treated as complete until the actual artifact can be retrieved from a fresh process. Trust in the World/Orb credential issuer and the fixed World verifier state remains in the protocol trust boundary as before; historical replay reproduces that judgment and does not remove issuer trust.

## Room-Specific World Action

Because World v4 nullifiers are scoped to human, RP, and action, each Room uses a unique action.

```text
actionText = "oshikatsu-room:" + roomId
action = World ID official hash-to-field(UTF8(actionText))
```

If a manifest hash is used instead of `roomId`, the protocol version fixes one or the other and does not use both. The RP backend does not accept arbitrary actions from clients and sign them; it derives `actionText` from the verified manifest and signs the RP request. As a result, even the same person has unlinkable different nullifiers across different Rooms, while the same Room produces the same nullifier.

## Freshness of the World Historical Anchor

Re-verification by historical `eth_call` uses the World block fixed for each initial ballot. However, to prevent the submitter from choosing an arbitrarily old block, all of the following are required.

```text
Block hash re-retrieved from World block number == block hash saved in ballot
World block timestamp <= ballot event consensus timestamp
ballot event consensus timestamp - World block timestamp <= 300 seconds
Before capability grant, the same World block hash becomes finalized
```

World Chain is OP Stack, and hard finality depends on Ethereum finality, so limiting the block to one already finalized before submission and within 300 seconds is usually incompatible. Therefore, 300 seconds is the freshness condition for the anchor at the time of HCS submission, and finality is confirmed after submission and before `CAPABILITY_GRANTED`. While waiting for finality, the state is `WAITING_WORLD_FINALITY`, and the ballot is not counted as voted. If the anchor block leaves the canonical chain before finalization, that initial ballot is invalid.

300 seconds is a protocol constant aligned with the standard TTL of the World RP request. If changed in the future, it is fixed by the manifest and protocol version. `expiresAtMin` is not the actual expiration of the credential; it is separately verified as a lower bound that the credential is valid at least until that time.

During re-verification, not only the WorldIDVerifier proxy address at the same block is checked, but also the ERC-1967 implementation, dependent registry, Groth16 verifier, and each runtime code hash. At least two independent archive providers are used, and in production, a self-operated archive node is included as one of them.

## SEAL

SEAL does not change the manifest `deadline`; it commits the result of the public fold established up to the deadline. The SEAL payload, Room, manifest hash, cutoff sequence, and authority Hedera payer or signature are verified. Even if SEAL is delayed, votes after the deadline do not become valid.

Under the current specification, Hedera Schedule Service cannot handle `ConsensusSubmitMessage` as a scheduled transaction. Therefore, HCS SEAL does not require `scheduled=true` or `scheduleRef == manifest.sealScheduleId`. If SEAL must be connected to Hedera scheduled execution, use a separate protocol in which a scheduled `ContractExecuteTransaction` writes the seal state to another Hedera smart contract and the `scheduleRef` in that contract record is verified. Even in this case, the HCS SEAL message itself is a normal post, and the hash references of the two must be explicitly linked.

## Constraints of HCS Open Submit

HCS open-submit topics do not reject posts after the deadline at the network entrance. Ballots, updates, withdrawals, and Nominee additions after the deadline may remain in HCS history, but the public fold invalidates them using the manifest `opensAt` and `deadline`.

Therefore, the exact formal rule is not "posting is possible only during the voting Window," but the following.

> A single-message event is valid only if it reaches HCS consensus inside the voting Window. Chunked events are invalid as protocol violations.


# Part II: Screen Definitions

Screens are designed around what the user is feeling now, what they decide, and where they go next. Each screen receives the necessary data and passes the user's selection or confirmation result to the next screen. Communication method, URL structure, component library, and fine dimensions are decided during the Coding phase.


## Reader App

### Screen Name: (Common to All Screens)

What this screen does:
    For describing areas that are always displayed on every screen

- Area name: Global navigation
    - Area purpose or function: Icon + screen-name buttons always present at the bottom of the screen. Used to move between screens
    - Area design taste: Dark mode + neon colors
    - Components inside
        - `Home`: Displays the home screen
        - `Rankings`: Displays Room ranking and results
        - `My Shelf`: Displays registered works and the next Oshi
        - `Profile`: Displays pseudonymous profile, achievements, and Room creation

    The navigation items and order are fixed across all screens. The current location is indicated by the combination of label, icon, and accent color, and does not rely on color alone.

### Screen Name: Home

What this screen does:
    The start screen for first-time registration. After registration, this becomes the starting point that communicates when the next Room opens, hints at the manga available for participation, and invites the reader into shared time. The excitement of a new release day. An important screen that conveys the image of a live venue.

- Area name: Start Oshikatsu
    - Area purpose or function: A place that displays a button to proceed to Wallet registration before first-time registration
    - Area design taste: A single strong CTA to enter the live venue, clearly separated from the energy of the background
    - Components inside
        - `Start My Oshikatsu`: Proceeds to Wallet connection. After connection, returns to Home through the initial My Shelf setup
        - `Browse First`: Views public Rooms without connecting a Wallet

- Area name: Room list
    - Multiple buttons show Room names and current status, with the Room currently accepting Vote at the top. Rooms scheduled to start next are listed after it
    - Pressing one enters that Room (live venue)

- Area name: SpecialRoom entrance
    - Area purpose or function: Views Readers who contributed to manga culture as candidates and expresses support for a person as a Protected Shout (Vote). Displayed on Home like a limited-time event in a social game. This is displayed in a separate area from normal Rooms
    - Area design taste: A limited-time event banner in a social game. A place with a special event feeling. A festival held several times a year. More ceremonial expression than normal Rooms
    - Components inside
        - Room:
            - Room title: Identifies the shared time to participate in. Example: identifies this special Room as `Manga Culture Contribution Award`
            - Enter Room: Primary CTA to the Room. Message changes according to phase
            - Groove Level: Shows the current momentum of Reaction and Shout.
            - Fans in the Lobby: Presence count showing the scale of people viewing the Room
            - Vote deadline: Shows the voting deadline as `Voting Closes In`

### Screen Name: Room Screen

What this screen does:
    The live venue for Oshikatsu

- Area name: Inside normal Room
    - Area name: Pre-voting screen
        - Area purpose or function: Displays the Room title (today's Oshikatsu) and time until opening. A screen for waiting for the Room to open. It displays "today's Oshikatsu, until opening" and "everyone, are you ready?" to build excitement. A live-event opening clock. Time is placed as the first visual focus
        - Area design taste: The excitement of a new release day. The image of a live venue
        - Components inside
            - Room title: Identifies this week's shared time. Example: `Weekly Chapter Drop`
            - Enter Room: Primary CTA to the Room. Switches between `Join the Groove`, `Enter the Lobby`, and `Replay the Room` according to phase. Entering displays the inside of the Room
            - Groove Level: Shows the current momentum of Reaction and Shout
            - Fans in the Lobby: Presence count showing the scale of people viewing the Room
            - Vote deadline: Shows the voting deadline as `Voting Closes In`
            - Work list
                - Area name: Maintain work list as a table
                - Area name: Recommend one work
                    - Area purpose or function: Reader enters information about a work they want to support and creates a Nominee event
                    - Area design taste: Prioritize the experience of creating a recommendation card over a posting form
                    - Components inside
                        - Manga information: Enter title, chapter, cover, and reading location
                        - Nominee preview: Confirm how it appears in the Room
                        - Nominate action: Creates the Nominee intent to pass from `Review Nomination` to Wallet signature
                        - Window notice: `Nominations lock when the Room opens.`
    - Area name: Voting screen
        - Area name: VotingLineup
            - Area purpose or function: Lists works fixed in the manifest
            - Area design taste: Combines the table of contents of a weekly magazine with the new-release display at a bookstore
            - Components inside
                - Lineup: Communicates the overall candidate works with a cover stack and `Tonight's Lineup`
                - Locked state: Displays `Lineup Locked`
                - `Open Groove`: Goes to the work's Groove. Opening the view alone does not send a Shout Vote
        - Area name: VotingStatus
            - Area purpose or function: Displays the Groove of the selected work (the momentum of other people's stamps and shouts)
            - Area design taste: A screen where everyone gathers around the work. The work is at the center, surrounded by everyone's stamps
            - Components inside
                - Area name: Work hero
                    - Area purpose or function: Presents the work, chapter, and reading location
                    - Area design taste: Treats the cover as full-bleed and enters the world of the work
                    - Components inside
                        - Cover: Visually identifies the work
                        - Chapter information: Identifies this installment
                        - Read action: Proceeds to the official reading location with `Read Official Chapter`
                - Number of posts by stamp
                    Stamp name X people
                - Number of people who pressed stamps
                - Shout list
                - `Osu!(React & Shout)`
                    - Displays VotingDialogue. Opening the dialog alone is not a Vote; `Send Shout` sends the Protected Shout
                    - Area name: VotingDialogue
                        - Area purpose or function: Select a Reaction and Shout, and create a Protected Shout event expressing the current Vote for the selected work
                        - Area design taste: Large stamps that preserve emotional intensity and a short input field
                        - Components inside
                            - Reaction palette: Choose from `🔥 Peak Chapter`, `😭 Cried My Eyes Out`, `🥺 Too Precious`, `🐉 Next Chapter Now`, `👑 Chapter of the Week`, `💡 I'm Dead`, `🤗 I Melted`, `🐼 Emotionally Wrecked`, `🌋 I'm Losing It`
                            - Shout input: Enter a short impression in `Drop your post-chapter scream...`
                            - Vote action: Creates the current intent bundling work, Reaction, Shout, and account with `Send Shout`. World proof is requested only on the first Shout
                - `Add to My Shelf`: Saves this work to the personal collection independently from voting. If already added, switches to `Remove from My Shelf`
    - Area name: Room Ranking screen
        - Area purpose or function: Looks back at the ranking aggregated from the final intent up to the deadline and the Room's GrooveWave.
        - Area design taste: A strong action bar stably visible at the bottom of the screen
        - Components inside
            - Area name: This week's ranking
                - Area purpose or function: Shows rank, point, and valid capability count
                - Area design taste: A magazine front-page ranking. Treats the winner's cover prominently
                - Components inside
                    - Winner feature: Shows the first-place work as `Tonight's Winner`
                    - Final Ranking: Shows the rank and point of every work
                    - Verification summary: Summarizes `Verified Shouts`, cutoff, and accepted Shout count
                    - Verify Results: Proceeds to manifest hash, result hash, and public replay


- Area name: Inside special Room
    - Area name: Special Room hero
        - Area purpose or function: Communicates the award, event period, and selection theme
        - Area design taste:
        - Components inside
    - Area name: Reader Nominee
        - Area purpose or function: Compares candidates and public achievements, and selects one person
        - Area design taste: Shows a person's story and achievements at the same time
        - Components inside
            - Nominee profile: Shows pseudonym, achievements, and works they have supported
            - Public Contribution Signals: Shows candidate reasons traceable to supporting events
            - Activity summary: Briefly summarizes public events. When AI-generated, displays `AI-generated summary of public activity`, and always makes it possible to trace back to supporting events
            - Voter selection: Selects one voting target
            - Shout action: Proceeds from `Shout for This Finalist` through World proof on the first Shout and then to Wallet signature

        AI output does not determine candidate qualification, voting weight, rank, or reward entitlement. Candidate comparison and Protected Shout can continue even if AI is unavailable.


### Screen Name: Wallet Connection / World Proof Progress

What this screen does:
    Reader binds the Protected Shout and Room capability to their own Hedera account.
    For the PoC, HashPack is the only Wallet. This screen is not so much a dedicated screen as one invoked as needed when Wallet connection or human proof is required for a Shout or Nominate signature. It obtains the Proof of Human required for the first Shout and communicates World anchor finality and public verification progress to Reader.

- Area name: Wallet selection
    - Area purpose or function: Shows HashPack and the connected account. Displayed when Wallet connection is needed, and kicks off human authentication by World or Vote signature
    - Area design taste: Quiet and clear. Gives a sense of trust in self-managed keys. But the base is still a live venue
    - Components inside
        - HashPack identity: Shows official brand asset and `HashPack`
        - Connected account: Confirms Hedera account ID and network after connection
        - Connect action: Proceeds to Wallet-side approval with `Connect HashPack`
        - Browse action: Returns to signature-free browsing with `Browse Without Connecting`

- Area name: Proof request
    - Area purpose or function: Handles the Room-specific action, Shout intent signal, and World App handoff
    - Area design taste: A quiet screen centered on privacy and progress
    - Components inside
        - Proof of Human explanation: Communicates the meaning of one person, one qualification with `One human. One spot in this Room.`
        - World App action: Proceeds to proof request with `Verify with World ID`
        - Trust summary: `Orb-verified human`, `Unique in this Room`, `Privacy-preserving proof`
        - Privacy details: Shows that identity on World ID is not published, and that proof, nullifier, and Room-bound inputs are publicly verified

- Area name: Protected Shout status
    - Area purpose or function: Shows the state transition as one progress flow
    - Area design taste: A stepper closer to an itinerary display than a technical log
    - Components inside
        - Proof acquired: Shows World proof acquisition
        - HCS submitted: Shows Wallet-signed submission
        - Message confirmed: Shows that exact bytes and payer have been confirmed by Mirror Node
        - World finality: Shows anchor block finality
        - Capability granted: Shows establishment of Room capability

### Screen Name: My Oshikatsu (Bookshelf)

What this screen does:
    Looks back at the Rooms I joined, works I supported, and achievements earned, and finds the next manga from Readers with similar Oshi.
    This screen is reached from the Navigation at the bottom of the screen

    - Area name: Pseudonymous profile
        - Area purpose or function: Shows Hedera account, display name, and participation achievements
        - Area design taste: An Oshikatsu notebook. Collection items and history are arranged neatly
        - Components inside
            - Account identity: Shows the pseudonymous account
            - Badge shelf: Shows `Room Winner`, `Hidden Gem Scout`, `Long-Run Supporter`, `Rooms Joined`
            - My Shelf: Shows registered works as a cover grid
            - Room History: Shows joined Rooms and Top 3

    - Area name: Next Oshi
        - Area purpose or function: Shows Readers with similar Oshi tendencies and the manga those Readers support
        - Area design taste: A recommendation shelf that follows people to books
        - Components inside
            - Similar Reader: Shows a pseudonymous profile with similar Oshi tendencies
            - Recommended work: Shows a work supported by that Reader
            - Go to work: Proceeds to the reading location or next Room

### Screen Name: My Page

What this screen does:
    - Displays my own information
    - Room creation is also done from here

- Main English labels
    - Screen name: `Profile`
    - Room creation: `Create a Room`


## UI: Fandom Vocabulary and Visual Direction

The Reader App chapter is the source of truth for screens, transitions, components, and display copy. This chapter does not redefine the content of each screen; it defines only decisions that apply commonly to all screens.

### Fandom Vocabulary

The Japanese fandom terms used in Oshikatsu and their meanings in English UI are fixed as follows. Romaji is used so Readers who do not know Japanese can pronounce the terms and encounter the original words on vocabulary pages or supplemental displays. The English column is not a literal translation, but the expression that communicates intent and operational result most accurately in the UI.

#### Core Vocabulary

| Japanese | Romaji | English | Explanation |
| --- | --- | --- | --- |
| 推し | oshi | `Oshi` / `Favorite` | A work or person one especially wants to support. `Oshi` can be used as an Oshikatsu-specific concept, but on first appearance, include context that makes the target clear. Use `favorite` in general explanations. |
| 推し活 | oshikatsu | `Oshikatsu` / `supporting your oshi` | The entire activity of supporting, talking about, and expanding discoveries around one's Oshi. Because it overlaps with the product name, do not mechanically translate it as `Oshi Time` in feature names. |
| 推す | osu | Depending on the operation, `React` or `Shout` | In Japanese this covers support actions in general. In the English UI, a Reaction sends emotion only, while a Shout sends the current Vote for a work or person. No separate Ballot action is shown. |
| スタンプ | sutampu | `Reaction` | A short expression that sends emotion toward a work with emoji and label. It does not change the ballot. English UI uses the more natural `Reaction` rather than `Stamp`. |
| 叫び | sakebi | `Shout` / `Vote` | A short text expression that releases post-reading energy while expressing the current Vote for the selected work or person. It is distinguished from `Comment`, which implies general discussion. |
| 推薦 | suisen | `Nomination` | Proposing a work to the candidate set before the Room starts. Where distinction from a general act of recommending a work is needed, use `Room Nomination`. |
| 候補 | kouho | `Nominee` | A work or person that passes the Nomination Window and is compared or voted on in the Room. |
| 投票 | touhyou | `Vote` / `Protected Shout` | A formal intent recorded to HCS. Use `Shout` or `Vote` for user actions and display. `Ballot v2` is limited to the internal wire name that carries the Evidence commitment. A Reaction by itself is not a Vote. |
| 盛り上がり | moriagari | `Groove` | Oshikatsu-specific live energy that combines Reaction, Shout, and participation momentum within a Room. It is not a simple vote count. |
| 共鳴 | kyoumei | `Resonance` | The degree to which a Reader's expression reaches other Readers and produces reactions. Use it as a metric name only when the basis for calculation can be shown. |
| 本棚 | hondana | `My Shelf` | A personal collection where Reader places registered works and works they want to read next. It is independent from Shout Votes. |
| 実績 | jisseki | `Badges` / `Achievements` | Records obtained from Room participation and support history. On-screen collectibles are `Badges`; the overall system is `Achievements`. Display `NFT` only when it is an on-chain token. |
| 原石発掘 | genseki hakkutsu | `Hidden Gem Scout` | An achievement for a Reader who supported a work early, while it still had little attention, and that work later became the Room winner. |
| 継続応援 | keizoku ouen | `Long-Run Supporter` | An achievement for a Reader who has continuously joined multiple Rooms and supported works. |
| 投票回数 | touhyou kaisuu | `Rooms Joined` / `Votes Cast` | Separate the English based on what is counted. Room participation count is `Rooms Joined`; the count of established Protected Shouts is `Votes Cast`. |

#### Reaction Vocabulary

| Japanese | Romaji | English | Explanation |
| --- | --- | --- | --- |
| 神回 | kamikai | `Peak Chapter` | A chapter of exceptional quality that makes fans feel "this one is the best." It carries the nuance of `Peak fiction`. |
| 泣いた | naita | `Cried My Eyes Out` | Expresses being strongly emotionally moved to tears. |
| 尊い | toutoi | `Too Precious` | A fandom expression meaning a relationship or existence is so lovable and valuable that one wants to protect it. Do not translate it as simple `respect`. |
| 続き召喚 | tsuzuki shoukan | `Next Chapter Now` | Strong anticipation to read the continuation immediately. Use a natural CTA expression rather than the literal `summon the next chapter`. |
| 優勝 | yuushou | `Chapter of the Week` | Not an actual award, but a fandom expression that this installment resonated most with the individual Reader. Distinguish it from the winner of the formal ranking. |
| 無事死亡 | buji shibou | `I'm Dead` | An exaggerated expression meaning it was too good, too precious, or too impactful. It does not mean actual harm. |
| 溶けた | toketa | `I Melted` | Expresses the feeling of becoming unable to resist because of cuteness, sweetness, or emotion. |
| 情緒崩壊 | joucho houkai | `Emotionally Wrecked` | A state where emotions are greatly disturbed by the development. |
| 情緒噴火 | joucho funka | `I'm Losing It` | A state where emotion cannot be contained and is erupting. It is more outward-facing and forceful than `Emotionally Wrecked`. |

Even when Vocabulary is displayed in the UI, the English label is the main operation display, and Japanese and Romaji are provided in tooltips, glossary, or supplemental sheets. Do not communicate meaning only with emoji; each Reaction must have an English label and accessible name.

### Language

Copy displayed to users uses English as the source of truth; Japanese is used only to explain design intent. Operation names must not blur differences in results.

- `React` is an emotional expression into Groove and does not change the Vote. `Shout` is both a Groove expression and an update to the current Vote for the selected work or person.
- `Nominate` is used only for candidate addition before Room start.
- `Vote` and `Protected Shout` are used only for formal intent recorded to HCS. Do not show users a separate `Ballot` action.
- An update is `Update Shout`, and a withdrawal is `Withdraw Shout`; do not use `Delete` or meaningless `Confirm`.
- `Oshi` and `Groove` are used as Oshikatsu-specific terms. Where the meaning cannot be inferred at first sight, show the context of work, Room, and support at the same time.
- General participants are not called `Jury`; use `Voter` or `Verified Voter`.

Fandom terms are used actively in Shout, Reaction, and Room presentation, but plain and direct English is used for Wallet signatures, World proof, deadlines, and verification results.

### Visual Direction

Reader App is not drawn as "purple placed on a black screen," but as an experience where the world of manga is projected into a darkened live venue and light and heat increase through Reader reactions.

- The background is based on black, with work covers, venue lighting, and light sticks as visual starting points.
- The energy of a normal Room is expressed with electric violet, hot magenta, and cyan. Gold is limited to winners, ranks, and Special Room ceremony.
- Manga covers and people are the strongest visual information, and explanatory text or operation panels must not cover the work.
- Place only one large primary action. Glow is limited to primary action, live state, and winner reveal, while ordinary lists, forms, and protocol details are distinguished with quiet outlines.
- Countdown, people count, ranking, and verification state are not baked into images; they are structured as UI displaying live data.
- Confetti, floating Reaction, and light beams are motion layers that communicate state changes, and must not cover body text, controls, or faces on covers.
- Special Room is based on the same night venue as normal Rooms, and changes into ceremony with laurel, crown, and gold light. Do not give it a color scheme that feels like a different product.

### Composition

- Use mobile first, and make the main visual, current phase, and primary action understandable in the first viewport.
- Bottom navigation items and order follow the Reader App definition and do not change by screen.
- Secure a safe area so the fixed action bar and bottom navigation do not hide body text, the last card, or input fields.
- On desktop, do not enlarge the mobile screen; place the Room or work in the center and Lineup, Groove, and Protected Shout status on the left and right.
- Lists and comparisons maintain fixed cover ratios and row heights, and title or count length must not move the layout.

### State Expression

- Do not treat presence count and `Verified Voter` count as the same number.
- Completion of sending to HCS is not vote establishment. Do not use success color, checkmark, or confetti until `CAPABILITY_GRANTED`.
- Distinguish `PENDING` as in progress, `UNVERIFIABLE` as temporary shortage of public evidence, and `INVALID` as verification failure, using separate colors, icons, and copy.
- Protocol hashes, sequences, and block information are not hidden; summarize them on the main screen and make them confirmable when details are opened.
- Even on error screens, keep the Reader's selected work and entered Shout, and do not make them choose again from the beginning when retrying.

### Accessibility and Assets

- Body text and protocol status maintain high contrast; do not use magenta or violet for small text.
- Reaction combines emoji and English label, and passes the same meaning to screen readers.
- Ensure phase, ranking, and results are understandable even with motion stopped; stop swarm, pulse, and confetti under `prefers-reduced-motion`.
- Titles, countdowns, counts, buttons, and navigation are implemented as text and components, and are not included in bitmaps.
- Backgrounds, covers, avatars, frames, and textures are separated by use, and have focal points so the main subject is not lost under different aspect ratios.


# Part III: API Build + Headless PoC Testing

Part II is the source of truth for product behavior, and Part III defines only implementation order, proof of external dependencies, and completion evidence. Daily work status is placed in GitHub Issues, and real-network results are placed in run artifacts; they are not redundantly recorded in this document.

The first vertical slice to prove is the following.

```text
fixed Room manifest
    -> production World ID v4 Proof of Human
    -> HashPack-signed initial ballot on Hedera testnet
    -> Mirror Node exact-byte confirmation
    -> finalized historical World verification
    -> Room capability
    -> update / withdraw / re-update
    -> deterministic result
    -> independent public replay with the same result hash
```

Until this slice is complete, advanced Groove aggregation, Achievement delivery, AI summaries, recommendations, multi-Room operation, and Reader App visual implementation are deferred.

## Source and Implementation Policy

- Hedera implementation refers to official Hedera MCP documentation and OpenAPI, the Hedera skill fixed in the workspace, and Context7 in that order.
- The TypeScript Hedera SDK uses `@hiero-ledger/sdk`.
- Run the official sample as the smallest real-network script before moving it into Oshikatsu abstractions.
- Skill samples are used as implementation patterns, but official documentation is the source of truth for network limits and protocol semantics. HCS chunks are limited to 1,024 bytes per item.
- World ID and World Chain are also confirmed in the order of official documentation, official repository, and actual production proof; do not implement guessed field mappings.

## Stop/Go Gates

The following pass before building the overall API. If they fail, do not add downstream implementation; update the protocol in Part I.

### Gate 0-A: World v4 ballot binding

With production `proofOfHuman` and `allow_legacy_proofs=false`, prove the following.

1. Create a signal from a fixed Room, fixed ranking, and fixed Hedera account.
2. Confirm that the IDKit result `signal_hash` matches the official `hashSignal(signal)` and is not `0x0`.
3. Succeed with both Developer Portal verify and canonical `WorldIDVerifier.verify`.
4. Individually change signal, action, nonce, and proof, and confirm that the result becomes `INVALID`.

**GO:** The custom signal enters the raw proof, and ballot binding can be reproduced in the historical verifier call.

**STOP:** The custom signal does not enter the proof, or the required input cannot be reconstructed outside the Portal. In this case, change the current design in which "the proof binds the ballot."

### Gate 0-B: World v4 Room uniqueness

For the same Orb-verified human, perform multiple proof requests using fresh nonces with the same RP/action.

| Attempt | Action | Signal | What to observe |
| --- | --- | --- | --- |
| A | Same | Same | baseline nullifier |
| B | Same | Same | reissuance availability and nullifier |
| C | Same | Changed | reissuance availability and nullifier |
| D | Different Room | Same | whether nullifier separates across Rooms |

**GO:** The second item in the same Room is rejected, or a stable value that can uniquely identify the same human in the HCS fold is obtained.

**STOP:** Multiple fresh and independently usable nullifiers can be generated in the same Room. Do not assume the v4 nullifier is a "human + RP + action stable ID"; consider a session or another capability design.

### Gate 0-C: HashPack wallet-signed single-message HCS event

With a real HashPack device, post one actual Reaction and one Protected Shout each as a transaction to an open-submit topic on Hedera testnet. The Protected Shout binds the user's Shout intent to the World Evidence commitment and is called `Ballot v2` only in internal wire fixtures. Application payload is 900 UTF-8 bytes or less, and the SDK uses `setMaxChunks(1)`.

**Items to confirm:** approval count, payer, transaction ID, sequence, consensus timestamp, exact message bytes, not mistaking the wallet success display before Mirror retrieval for formal success, and allowing/rejecting the 900/901-byte boundary respectively before opening the wallet.

**GO:** The connected HashPack account signs and pays for one event of 900 bytes or less, and the same payer, exact bytes, and consensus timestamp can be obtained from Mirror Node. 901 bytes or more and chunked transactions are rejected in preflight.

**STOP:** The actual payload does not fit within 900 bytes, HashPack cannot execute a single-message Topic Submit, or exact bytes and payer cannot be confirmed from Mirror evidence.

Wallet chunk groups of 1,025 bytes or more are outside the acceptance target of the current protocol and remain open as future research Issues.

### Gate 0-D: World historical replay

Call `eth_call` for a valid production proof at the selected World block, and after the same block hash is finalized, re-execute from two archive RPC systems.

**GO:** Block hash, verifier dependency, and call result match, and tampered proof reverts.

**STOP:** Historical state cannot be retrieved, providers disagree, or verification-critical state cannot be identified from the public artifact.

## Architecture Boundaries

API, Headless client, and Reader App are consumers of the protocol and do not define public bytes or judgment rules.

```text
apps/api     apps/cli     apps/web
         \          |          /
            application use cases
             /       |        \
 protocol   projection   external adapters
```

| Package | Responsibility |
| --- | --- |
| `@oshikatsu/protocol` | versioned schema, canonical JSON, hash, action, signal, wire type, golden vector |
| `@oshikatsu/domain` | Room phase, event validation, capability policy, latest intent, ranking, reason code |
| `@oshikatsu/hedera` | 900-byte application limit, single-message transaction construction, operator or wallet submission |
| `@oshikatsu/mirror` | REST pagination, raw schema validation, sequence gap, chunked event rejection, payer and consensus metadata |
| `@oshikatsu/world-id` | manifest-derived action, RP signature, IDKit request DTO, raw v4 result parse |
| `@oshikatsu/world-chain` | multi-RPC block comparison, historical `eth_call`, finality, proxy/dependency snapshot |
| `@oshikatsu/projection` | decode, verify, fold, and result/replay report generation from public sources |
| `@oshikatsu/wallet-handoff` | Browser handoff for HashPack and World App. Does not handle private keys |
| `apps/cli` | Starts use cases and returns human-readable tables and machine-readable JSON |

Do not bring Hedera SDK, World SDK, Express, React, or Firestore types into the protocol package. Projection may use the same pure fold, but CLI replay obtains input from public sources without trusting results saved by the API.

## Milestones

Each milestone is split into Issues of about 0.5 to 2 days, and only one milestone is started at the same time. Completion is determined by acceptance evidence, not amount of code.

### M0: Feasibility gates

- Execute Gate 0-A through 0-D.
- Record `GO`, `GO WITH CONSTRAINT`, `STOP`, or `BLOCKED` for World action, signal, nullifier, anchor, and wallet single-message submission.
- If even one `STOP` exists, do not start downstream implementation; update the protocol decision.

**Evidence:** sanitized IDKit result, RP context, World call input/result, Hedera transaction IDs, raw Mirror responses, decision report.

### M1: Protocol kernel and CLI skeleton

- Fix canonical schema and domain-separated hash as version 1.
- Treat bigint, Hedera consensus timestamp, and hash as string/bytes, not JavaScript number.
- Make the official RP signature/hash test vector and Oshikatsu golden vector test fixtures.
- Prepare `doctor`, `fixture verify`, and `world spike` in `apps/cli`.

**Gate:** Processing the same fixture from different processes produces byte-for-byte matching manifest hash, ballot hash, and signal hash.

### M2: Hedera testnet transport

- Pass open-submit topic creation and message submit from the official HCS sample.
- Paginate Mirror REST in ascending sequence order and obtain raw messages.
- Verify payer, topic, sequence, consensus timestamp, and exact bytes.
- Reject `chunk_info.total > 1`, oversize, and duplicate event fixtures.

**Gate:** A new process reconstructs the same manifest bytes, payer, sequence, and consensus timestamp from Mirror Node alone, without using API memory.

### M3: Browser approval handoff

- Headless CLI creates a short-lived handoff and displays a browser URL or QR.
- The browser performs HashPack Topic Submit and World App request, and the CLI polls public status and resumes.
- Rejection, timeout, disconnect, and partial submission are returned as terminal states.

**Gate:** With a real HashPack device, wallet-signed payload is posted to Hedera testnet, and the connected account matches the Mirror payer.

### M4: World production verification

- The backend derives action from the manifest and creates a request with a 300-second TTL using the RP signing key.
- Save the v4 raw result to the artifact without modification, and derive normalized verifier input separately.
- Oshikatsu selects the preflight block and saves block number/hash/timestamp.
- Track historical verification and finality with two archive RPCs.

**Gate:** Valid proof, tampered proof, and provider unavailable can be classified as `VALID`, `INVALID`, and `UNVERIFIABLE`, respectively.

### M5: Initial ballot capability slice

- Create an initial ballot envelope with a fixed candidate set.
- Publish a versioned canonical World evidence artifact, and have the client retrieve it again from the committed reference to confirm digest and ballot binding.
- Post an initial ballot of 900 bytes or less with HashPack, including proof digest, immutable evidence reference, and World anchor.
- Advance `SUBMITTED -> MIRROR_CONFIRMED -> WAITING_WORLD_FINALITY -> VALID -> CAPABILITY_GRANTED`.
- Determine conflicts based on the uniqueness semantics fixed in Gate 0-B.

**Gate:** For one real Room, one real human, and one HashPack account, `CAPABILITY_GRANTED` can be explained using public evidence only.

### M6: Ballot lifecycle and deterministic result

- Post update, withdraw, and re-update to HCS.
- The single-message event with the maximum sequence that reached consensus before the deadline becomes the current intent.
- Reject after-deadline single-message events, wrong payer, duplicate events, and chunked events.
- Calculate result hash with a fixed point rule and commit it to authority SEAL.

**Gate:** API projection and fresh CLI replay generate the same current intent, ranking, and result hash.

### M7: Cloud Run and durable projection

- Cloud Run API uses attached service account and ADC.
- Secrets such as the RP signing key are passed from Secret Manager, and when environment variables are used, the version is fixed.
- Firestore is limited to rebuildable projection/checkpoint and is not a formal source.
- Conduct a drill that deletes projection and rebuilds from Mirror + World public evidence.

**Gate:** A fresh Cloud Run revision and fresh CLI reproduce the same Room, and secrets do not appear in the image, browser bundle, logs, or artifacts.

### M8: Product expansion

After M0 through M7 are complete, sequentially add Nomination, Groove, Achievement, Special Room, and the Reader App implementation from Part IV. Until HTS implementation is complete, Achievement delivery explicitly returns `NOT_IMPLEMENTED` and does not simulate success.

## Headless CLI Contract

All commands default to a human-readable table and return machine-readable output with the same meaning under `--json`.

```ts
type CommandResult<T> =
    | { status: "SUCCESS"; data: T; evidence: EvidenceRef[] }
    | { status: "PENDING"; data?: T; nextCheckAt?: string; waitingFor: string[] }
    | { status: "INVALID"; reasons: ReasonCode[]; evidence: EvidenceRef[] }
    | { status: "UNVERIFIABLE"; missing: EvidenceRequirement[]; retryable: boolean };
```

Command output includes transaction ID, topic ID, sequence, consensus timestamp, payer account, World block number/hash, and provider observation when applicable. It does not output secrets, complete credentials, or unnecessary personal/device information.

Only the first commands to implement are fixed.

```text
doctor
fixture verify
world spike
wallet handoff
shout submit
shout status
replay room
```

The current `ballot submit` / `ballot status` names are retained only as internal compatibility aliases. New documentation, demos, and help output use the `shout` commands as the source of truth. Additional commands are added when the corresponding milestone is reached. Do not create stubs for all commands in advance.

## Evidence and Context Continuity

Real-network tests are saved to `artifacts/runs/<UTC-run-id>/`. Private keys, RP signing keys, access tokens, and unnecessary World identity information are not saved.

```text
artifacts/runs/<run-id>/
    run.json            # commit, dependency hash, network, protocol version
    inputs/             # sanitized canonical inputs
    hedera/             # topic, transaction, sequence, Mirror response hash
    world/              # RP/action, anchor, provider observation, call result
    replay/             # accepted/rejected reason, capability, result hash
    report.json         # machine-readable verdict
    next.md             # next single executable action
```

At session start, read the active GitHub Issue, latest run `next.md`, git status, and previous gate command. At session end, leave the following in the Issue.

```markdown
### Handoff — YYYY-MM-DD
Commit/worktree: <SHA or dirty files>
Completed: <observable result>
Validation: <commands and result>
Evidence: <run path or links>
Decision: <new constraint or none>
Blocked by: <specific dependency or none>
Next action: <one exact executable step>
```

Do not write work status to the SDD. Do not duplicate the source of truth for protocol in Issues. Record only reusable repository-specific pitfalls in repository memory.

## GitHub Management

- Manage M0 through M8 as GitHub milestones.
- Limit each Issue to one observable outcome, one main boundary, and one acceptance procedure.
- Use labels `spike`, `protocol`, `hedera`, `world-id`, `api`, `cli`, `evidence`, `blocked`, and `risk`.
- Create only one `Risk register` Issue, and record only risks that change architecture or schedule.
- Do not create a GitHub Project until multiple workstreams are running in parallel. If one is created, it has only status, milestone, risk, and owner, and does not duplicate SDD or acceptance criteria.

## PoC Completion Gate

- Gate 0-A through 0-D are all `GO` or explicit `GO WITH CONSTRAINT`.
- Orb-backed World ID v4 production proof has been obtained on a real device.
- An initial Protected Shout envelope of 900 bytes or less, including proof digest and immutable evidence reference, has been posted directly from HashPack to Hedera testnet.
- Raw proof has been obtained from public evidence storage and confirmed to match the digest recorded on HCS.
- Single-message exact bytes, payer, sequence, and consensus timestamp have been obtained from Mirror Node.
- The historical verifier call has been re-executed after finality at the same World block.
- The initial Protected Shout reaches `CAPABILITY_GRANTED` from public evidence.
- Update, withdraw, re-update, and deadline crossing have been confirmed with real HCS events.
- Public replay by a fresh process generates the same result hash as Backend.
- Provider outage, evidence retrieval failure, World App rejection, HashPack rejection, oversize preflight rejection, chunked event rejection, `INVALID`, and `UNVERIFIABLE` have been observed.
- Testnet artifact and third-party verification report have been saved.

# Part IV: UI Design Handoff

After the Completion Gate for API Build + Headless PoC Testing passes, add concrete visual design and interaction detail to the screen definitions.

- [ ] Map View Data for each screen to the finalized read model
- [ ] Map each action to the finalized use case
- [ ] Translate PENDING, INVALID, and UNVERIFIABLE into Reader-facing language and visual state
- [ ] Bring Room time, GrooveWave, World Proof progress, and Protected Shout current intent into an interaction prototype
- [ ] Design desktop and mobile navigation, layout, motion, and accessibility
- [ ] Separate backgrounds, covers, avatars, frames, and textures used in implementation into purpose-specific assets
- [ ] Replace Japanese, countdowns, counts, buttons, and bottom navigation baked into images with React components
- [ ] Record correspondence between source assets and derivative assets, crop focal point, and license status in the asset manifest
- [ ] Convert canonical English screen copy and protocol status copy into i18n keys
- [ ] Confirm by copy review that `React`, `Cheer`, and `Vote` are used according to their formal effects
- [ ] Confirm that there is no text overflow or control overlap at 320px mobile, 390px mobile, 768px tablet, and 1440px desktop
- [ ] Make it possible to stop confetti, reaction swarm, and pulse animation under `prefers-reduced-motion`
- [ ] Prepare accessible names for emoji Reaction, tooltips for icon buttons, and text summary for GrooveWave
- [ ] Confirm by E2E screenshot that only `CAPABILITY_GRANTED`, not `SUBMITTED`, is expressed as voting success