# Real-time DAO Governance Alerts with Kwala

> Automate anonymous vote notifications for DAO communities — no servers, no identity leaks, just YAML

DAOs run on participation, but tracking governance activity across on-chain contracts is tedious without dedicated infrastructure. In this guide, you'll build a real-time governance alert system using Kwala Workflows that listens for vote and whale activity on your `AnonymousVoting` contract and instantly pushes notifications to a Telegram channel — all without revealing voter identity.

With Kwala, you connect on-chain events to messaging APIs using simple YAML automation. No backend servers, no polling loops, no SDK overhead.

## Objective

Build two linked workflows that:

* Listen for `VoteCast` and `WhaleVoted` events emitted by the `AnonymousVoting` smart contract on Sepolia.
* Send real-time Telegram alerts to a DAO community channel whenever a vote is cast or a whale participates.
* Surface governance activity publicly without leaking any voter identity — the ZK proof handles privacy, Kwala handles the notifications.

## Prerequisites

Make sure you have:

* A MetaMask wallet connected to the Sepolia testnet and the Kwala network.

* A Telegram bot and channel set up via [@BotFather](https://t.me/BotFather).
* Access to the [Kwala Dashboard](https://kwala.network/dashboard) to create workflows.

Optional (you can use the predeployed frontend and contracts for testing):
* The contracts deployed on Sepolia (see the deployment guide in this repo).
* The frontend setup with the ZK ceremony done (see the deployment guide in this repo).
* The relayer setup (see the deployment guide in this repo).


## Step 1: Understand the contract events

The `AnonymousVoting` contract emits two events relevant to this workflow:

```solidity
// Emitted on every valid vote
event VoteCast(
    uint256 indexed proposalId,
    uint8 voteValue,       // 0 = Against, 1 = For
);

// Emitted only when the voter's balance exceeds the whale threshold
event WhaleVoted(
    uint256 indexed proposalId,
    uint8 voteValue        // direction only — whale identity stays hidden
);
```

**Why this is safe to broadcast:** neither event contains a wallet address, balance, or any data that could identify the voter. The `nullifierHash` is a one-way hash of `Poseidon(secret, address, proposalId)` — it proves uniqueness without revealing who voted.

Note your deployed contract address from the Sepolia deployment output. You'll need it in Step 3.

## Step 2: Set up the Telegram bot

Before configuring the Kwala workflow, set up your Telegram bot:

1. Open Telegram and search **@BotFather**.
2. Run `/newbot` to create a new bot and receive a **bot token**.
3. Add the bot to your DAO's community channel or group and make it an admin.
4. Use [@userinfobot](https://t.me/userinfobot) to get your **chat ID** (for a group/channel it will be a negative number, e.g. `-1001234567890`).

Note both:

* **Bot token**, for example: `7754368882:AAHS4KbbOkl5rEHoBBIR8eljgwq2PARYLyY`
* **Chat ID**, for example: `-1001234567890`

> **Tip:** Test your bot token using ReqBin or Postman with a POST request to `https://api.telegram.org/bot<YOUR_TOKEN>/sendMessage` before wiring it into Kwala.

## Step 3: Build Workflow 1 — Vote Cast Alerts

This workflow fires on every valid anonymous vote and posts a message to your Telegram channel.

### Step 3.1: Create the workflow

1. Go to your [Kwala Dashboard](https://kwala.network/dashboard).
2. Select **Create New Workflow**.
3. Name it `DAO_VoteCast_Notifier`.

### Step 3.2: Configure the trigger

* **Execute After:** `event` — fires once the event is detected on-chain.
* **Repeat Every:** `event` — re-triggers on every new `VoteCast`.
* **Expires:** Set a timestamp beyond your proposal's voting window, for example `31-12-2025 23:59` UTC.
* **Trigger Chain ID:** `11155111` (Ethereum Sepolia).
* **Source Contract Address:** your deployed `AnonymousVoting` address, for example `0xYourContractAddress`.
* **Recurring Event Name:** `VoteCast(uint256,uint8,bool,bytes32)`
* **Event Filter:** `NA`
* **Smart contract (optional):** paste the `AnonymousVoting.sol` source or upload the file — Kwala will extract the ABI automatically.

### Step 3.3: Configure the action

* **Action Name:** `telegram_vote_alert`
* **Action Type:** `POST API CALL`
* **API Endpoint:** `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/sendMessage`
* **API Payload:**

```json
{
  "chat_id": "-1001234567890",
  "text": "🗳️ New anonymous vote cast re.event(1) on Proposal re.event(0)\nVoter identity is private.",
}
```

* **Retries Until Success:** `5`
* **Execution Mode:** `Sequential`

## YAML configuration — Workflow 1

```yaml
Name: DAO_VoteCast_Notifier
Trigger:
  TriggerSourceContract: 0xYourAnonymousVotingContractAddress
  TriggerChainID: 11155111
  TriggerEventName: VoteCast(uint256,uint8,bool,bytes32)
  TriggerEventFilter: NA
  TriggerSourceContractABI: <base64-encoded ABI from Kwala dashboard>
  TriggerPrice: NA
  RecurringSourceContract: 0xYourAnonymousVotingContractAddress
  RecurringChainID: 11155111
  RecurringEventName: VoteCast(uint256,uint8,bool,bytes32)
  RecurringEventFilter: NA
  RecurringSourceContractABI: <base64-encoded ABI from Kwala dashboard>
  RecurringPrice: NA
  RepeatEvery: event
  ExecuteAfter: event
  ExpiresIn: 1767225599
  Meta: NA
  ActionStatusNotificationPOSTURL:
  ActionStatusNotificationAPIKey: NA
Actions:
  - Name: telegram_vote_alert
    Type: post
    APIEndpoint: https://api.telegram.org/bot<YOUR_BOT_TOKEN>/sendMessage
    APIPayload:
      chat_id: '-1001234567890'
      text: "🗳️ New anonymous vote cast re.event(1) on Proposal re.event(0)\nVoter identity is private."
    TargetContract: NA
    TargetFunction: NA
    TargetParams:
    ChainID: NA
    EncodedABI: NA
    Bytecode: NA
    EncodedGoContract: NA
    Metadata: NA
    RetriesUntilSuccess: 5
Execution:
  Mode: sequential
```

> **Note:** The ABI field will be auto-populated by Kwala when you paste or upload the Solidity source in the dashboard. Copy the base64 value it generates.

## Step 4: Build Workflow 2 — Whale Vote Alerts

This workflow fires only when a whale participates, giving your community an additional signal for high-stakes votes.

### Step 4.1: Create the workflow

1. In the Kwala Dashboard, select **Create New Workflow**.
2. Name it `DAO_WhaleVoted_Notifier`.

### Step 4.2: Configure the trigger

* **Execute After:** `event`
* **Repeat Every:** `event`
* **Expires:** same expiry as Workflow 1
* **Trigger Chain ID:** `11155111`
* **Source Contract Address:** same `AnonymousVoting` address
* **Recurring Event Name:** `WhaleVoted(uint256,uint8)`
* **Event Filter:** `NA`

### Step 4.3: Configure the action

* **Action Name:** `telegram_whale_alert`
* **Action Type:** `POST API CALL`
* **API Endpoint:** `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/sendMessage`
* **API Payload:**

```json
{
  "chat_id": "-1001234567890",
  "text": "🐋 A whale just voted re.event(1) on Proposal re.event(0)\nWhale identity remains private — only the direction is revealed."
}
```

* **Retries Until Success:** `5`
* **Execution Mode:** `Sequential`

## YAML configuration — Workflow 2

```yaml
Name: DAO_WhaleVoted_Notifier
Trigger:
  TriggerSourceContract: 0xYourAnonymousVotingContractAddress
  TriggerChainID: 11155111
  TriggerEventName: WhaleVoted(uint256,uint8)
  TriggerEventFilter: NA
  TriggerSourceContractABI: <base64-encoded ABI from Kwala dashboard>
  TriggerPrice: NA
  RecurringSourceContract: 0xYourAnonymousVotingContractAddress
  RecurringChainID: 11155111
  RecurringEventName: WhaleVoted(uint256,uint8)
  RecurringEventFilter: NA
  RecurringSourceContractABI: <base64-encoded ABI from Kwala dashboard>
  RecurringPrice: NA
  RepeatEvery: event
  ExecuteAfter: event
  ExpiresIn: 1767225599
  Meta: NA
  ActionStatusNotificationPOSTURL:
  ActionStatusNotificationAPIKey: NA
Actions:
  - Name: telegram_whale_alert
    Type: post
    APIEndpoint: https://api.telegram.org/bot<YOUR_BOT_TOKEN>/sendMessage
    APIPayload:
      chat_id: '-1001234567890'
      text: "🐋 A whale just voted re.event(1) on Proposal re.event(0)\nWhale identity remains private — only the direction is revealed."
    TargetContract: NA
    TargetFunction: NA
    TargetParams:
    ChainID: NA
    EncodedABI: NA
    Bytecode: NA
    EncodedGoContract: NA
    Metadata: NA
    RetriesUntilSuccess: 5
Execution:
  Mode: sequential
```

## Step 5: Deploy and test

1. In the Kwala Dashboard, save and compile each YAML workflow.
2. Deploy both workflows — you'll receive a Kwala workflow address for each.
3. Wait for the status of each workflow to show **claimed**, and then click **"Activate"**.

> **Important:** Switch MetaMask to the **Kwala network** when deploying workflows. Switch back to **Sepolia** when interacting with the `AnonymousVoting` contract (via the frontend).

> **You must hold Governance tokens to be able to cast a vote before a proposal is created**. Make sure you mint ZKGOV tokens using the `GovernanceToken` contract to your voter wallet(s) before creating a proposal.

To trigger a test notification:

1. Open your frontend at `http://localhost:3000` (or the deployed URL).
2. Connect a wallet that holds governance tokens.
3. Navigate to an active proposal and cast a vote using **Generate Proof & Vote**.
4. Within seconds, your Telegram channel should receive the vote alert.

If you want to trigger a whale alert specifically, cast a vote from a wallet whose balance meets or exceeds the `whaleThresholdBps` set on the proposal.

## Step 6: Monitor workflow execution

In the **Kwala Dashboard**, navigate to your deployed workflows and check:

* **Workflow Logs** — see each `VoteCast` or `WhaleVoted` event detected and the corresponding Telegram API call.
* **Execution Status** — confirm each notification was delivered successfully.
* **Retries and Failures** — debug any failed Telegram requests (typically a bad token or expired bot session).

## How it works end-to-end

```
Voter browser          AnonymousVoting.sol         Kwala nodes            Telegram
─────────────          ───────────────────         ───────────            ────────
Generate ZK proof  ──► castVote()             ──►  Detect VoteCast  ──►  POST /sendMessage
                        │                           event on Sepolia       │
                        ├─ emit VoteCast(...)  ──►  Execute action    ──►  "New vote on Proposal #0"
                        └─ emit WhaleVoted(...)──►  (if whale)        ──►  "A whale just voted"
```

The voter's wallet address never appears in either event. The ZK circuit proves eligibility and whale status; Kwala simply reacts to the public outputs.

## Privacy model reminder

| Data point        | Visible in alert? | Notes                                      |
| ----------------- | ----------------- | ------------------------------------------ |
| Voter address     | No                | Never emitted on-chain                     |
| Token balance     | No                | Proven inside the ZK circuit only          |
| Vote direction    | Yes               | Public output of the ZK proof              |
| Whale status      | Yes (boolean)     | True/false only — no balance revealed      |
| Nullifier hash    | Yes               | Proves uniqueness, not linkable to a wallet |
| Proposal ID       | Yes               | Identifies which proposal was voted on     |

## Conclusion

In this guide, you built a real-time DAO governance notification system using Kwala Workflows — no servers, no polling infrastructure, no voter identity exposure. Every anonymous vote triggers an instant Telegram alert to your community, and whale participation gets its own dedicated notification.

This pattern extends naturally to other governance signals: proposal creation, proposal finalization, or even treasury movements. Swap the event name and payload in the YAML, and Kwala handles the rest.

## Next steps

* **Monitor Your Workflows** — track execution logs and retry failures in the [Kwala Dashboard](https://kwala.network/dashboard).
* **Extend to Discord or Slack** — replace the Telegram `APIEndpoint` with a Discord webhook or Slack incoming webhook URL; the rest of the YAML stays the same.
* **Add a finalization alert** — create a third workflow that listens for a `ProposalFinalized` event and posts the final FOR/AGAINST tally to your community channel.
* **Best Practices** — read the [Kwala best practices guide](https://kwala.network/docs/concepts/best-practices) for tips on retry logic, expiry management, and workflow versioning.
