---
trigger: always_on
---

# Markdown & Documentation Standards

This file contains the Markdown hygiene and visual formatting standards for all generated documentation in this repository. Rules are written in English to optimize context window efficiency and reduce token usage.

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
   - Maintain structural consistency using standard Markdown elements: tables for multi-variable comparisons, concise bulleted lists, and bounded code blocks with language identifiers.
