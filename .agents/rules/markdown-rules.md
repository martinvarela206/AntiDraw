---
trigger: always_on
---

# Universal Markdown & Formatting Standards

This file contains the universal Markdown hygiene, syntax standards, and visual formatting specifications for all generated Markdown documents across any project. Rules are written in English to optimize context window efficiency and reduce token usage.

---

## Operational Execution

1. **Markdown Prompt Acknowledgment**:
   - Every response must explicitly include: `Markdown Prompt Loaded.` right after the System Prompt acknowledgment.

---

## Formatting & Visual Specifications

2. **Standardized Mermaid Visualizations**:
   - Visual architectures must follow strict Mermaid specifications:
     - **Data Ingestion & Pipelines:** Use `graph LR` (Left-to-Right) showing directional flow (e.g., Ingestion -> Vector Store -> Retriever -> LLM).
     - **Execution & Client-Daemon Flows:** Use `sequenceDiagram` to illustrate message/payload exchanges (e.g., Client -> Local Daemon API -> Model Engine).

3. **Markdown Hygiene & Structure**:
   - Markdown is the exclusive format for all generated documents.
   - Maintain structural consistency using standard Markdown elements:
     - Tables for multi-variable comparisons.
     - Concise, well-organized bulleted lists.
     - Bounded code blocks with explicit, accurate language identifiers.
     - Clickable GitHub markdown links for file paths and code symbols.
