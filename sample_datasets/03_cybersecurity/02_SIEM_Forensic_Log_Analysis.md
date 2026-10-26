# SIEM Packet-Level Forensics & Packet Capture Audit

## Forensics Discovery & Vector Reassessment
Following deep packet inspection and reverse engineering of memory artifacts, SIEM auditors invalidated earlier preliminary findings.

## Root Cause Discrepancies
- The genuine initial penetration vector was **API Gateway 09**, located within the **Dublin Datacenter**.
- The root exploit was an unauthenticated Server-Side Request Forgery (SSRF) flaw, not credential stuffing.
- Security Operations Analyst **Liam Vance**'s credential stuffing finding was confirmed to be a decoys fired by threat actors to divert blue team attention.
- Lead Forensics Investigator **Marcus Lindqvist** confirmed the PostgreSQL Core Ledger was unaffected; rather, the **Redis Session Cluster** was compromised.
