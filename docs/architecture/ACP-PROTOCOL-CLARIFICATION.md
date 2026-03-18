# ACP Protocol Clarification

Two protocols share the name "ACP" — they are unrelated. KMS uses the **Agent Client Protocol**.

## Agent Client Protocol (what KMS uses)
- **Origin**: Zed Industries, August 2025. Open standard, Apache 2.0.
- **Purpose**: Standardizes how editors/tools (Zed, JetBrains, Cursor) communicate with AI coding agents
- **Think of it as**: "LSP for AI agents" — same concept as Language Server Protocol but for agents
- **SDK**: `@agentclientprotocol/sdk` (npm), `AgentSideConnection` + `ClientSideConnection`
- **Transport**: stdio (primary) or HTTP (what KMS uses for containerization)
- **Production adopters**: Zed Editor, JetBrains AI Assistant, Google Gemini CLI, Block Goose
- **Spec**: https://github.com/agentclientprotocol/agent-client-protocol

## Agent Communication Protocol (different thing, NOT used by KMS)
- **Origin**: IBM/BeeAI, now Linux Foundation
- **Purpose**: Agent-to-agent interoperability at the platform level
- **Think of it as**: A REST-based standard for agents to discover and call other agents
- **SDK**: separate Python/TypeScript SDKs at agentcommunicationprotocol.dev
- **When to evaluate**: If KMS needs to federate with third-party agent platforms (out of scope for now)

## KMS Decision
KMS uses **Agent Client Protocol** (Zed/agentclientprotocol.dev). See ADR-0012, ADR-0018.
The IBM Agent Communication Protocol is not used and is not part of the current roadmap.
