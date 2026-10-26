# 🎯 Curated Judge Datasets & Evaluation Benchmark

This folder contains 3 production-grade, enterprise-realistic benchmark scenarios designed to demonstrate **Grounded Knowledge-Graph Q&A** to hackathon judges.

Each scenario includes:
1. **Document 1 (`01_*.md`)**: Primary agreement, specification, or protocol.
2. **Document 2 (`02_*.md`)**: Subsequent audit, forensic review, or safety report containing updates, new entities, and cross-document factual contradictions.
3. **`queries.json`**: Pre-calibrated test queries demonstrating **Multi-Hop Traversal**, **Contradiction Detection**, and **Hallucination Abstention**.

---

## 🏢 Scenario 1: Corporate M&A Due Diligence (`sample_datasets/01_corporate_mna/`)
- **Domain**: Biotech acquisition valuation & IP leadership.
- **Documents**:
  - `01_Merger_Agreement_TermSheet.md`: Apex Holdings acquiring NovaBio for $420M; Dr. Aris Thorne VP of Genomic Discovery.
  - `02_Q3_Forensic_Audit_Report.md`: Valuation reduced to $380M; Dr. Thorne stepped down due to non-compete.
- **Key Test Cases**:
  - **Multi-Hop**: `"Which city and state houses the facility holding proprietary patents directed by Dr. Aris Thorne?"`
    *(Reasoning: Dr. Aris Thorne → Omics Lab → Cambridge BioHub → Cambridge, Massachusetts)*
  - **Contradiction**: `"What is the agreed acquisition price for NovaBio Therapeutics across the agreements and audit reports?"`
    *(Detects: $420,000,000 vs $380,000,000)*
  - **Abstention**: `"What is the NASDAQ ticker symbol and IPO date for Apex Holdings?"`
    *(Refuses without hallucination)*

---

## 🧬 Scenario 2: Clinical Trial Safety (`sample_datasets/02_clinical_trials/`)
- **Domain**: FDA drug safety trial and interim safety board intervention.
- **Documents**:
  - `01_FDA_Phase_II_Protocol_NX109.md`: 50 mg/day maintenance dosage; Dr. Miriam Chen at Charité Berlin.
  - `02_Safety_Monitoring_Board_Report.md`: Emergency reduction to 25 mg/day due to liver enzyme toxicity; oversight transferred to Dr. Hans Meyer.
- **Key Test Cases**:
  - **Multi-Hop**: `"Which city and country is home to the medical facility where the trial for compound NX-109 was initiated under Dr. Miriam Chen?"`
    *(Reasoning: NX-109 → Dr. Miriam Chen → Charité University Hospital → Berlin, Germany)*
  - **Contradiction**: `"What is the approved daily maintenance dosage for Compound NX-109 across the trial documents?"`
    *(Detects: 50 mg daily vs 25 mg daily)*
  - **Abstention**: `"What is the commercial pharmacy retail price per bottle of compound NX-109?"`
    *(Refuses without hallucination)*

---

## 🔒 Scenario 3: Cybersecurity Post-Mortem (`sample_datasets/03_cybersecurity/`)
- **Domain**: SOC-2 cloud breach forensics vs SIEM packet audit.
- **Documents**:
  - `01_SOC2_Incident_Response_Report.md`: Penetration via Bastion Gateway 04 in Frankfurt Datacenter; VPN credential stuffing.
  - `02_SIEM_Forensic_Log_Analysis.md`: Actual entry via API Gateway 09 in Dublin Datacenter; SSRF exploit; VPN was a decoy.
- **Key Test Cases**:
  - **Multi-Hop**: `"Which specific database system is housed in the datacenter where Bastion Gateway 04 routes ingress traffic?"`
    *(Reasoning: Bastion Gateway 04 → Frankfurt Datacenter → PostgreSQL Core Ledger)*
  - **Contradiction**: `"What was the initial penetration vector and compromised gateway during the incident across the reports?"`
    *(Detects: Bastion Gateway 04 / credential stuffing vs API Gateway 09 / SSRF)*
  - **Abstention**: `"What was the total financial ransom demanded in Bitcoin by the threat actors?"`
    *(Refuses without hallucination)*
