# PulseMesh Contracts

PulseMesh is built around four stable artifact contracts:

1. **Profile contract**: what an operator gives PulseMesh.
2. **Provider result contract**: what every provider returns internally.
3. **Summary contract**: what every run writes for agents and reports.
4. **Baseline contract**: what rolling historical context stores between runs.

These contracts are intentionally simple JSON shapes. Providers may add metadata, but they should not remove or reinterpret the required fields.

## Stability Rules

- Required fields are additive-only after `0.2`.
- Unknown profile fields are preserved as provider parameters.
- Every run must write a summary JSON, even when live providers fall back.
- Fallback state must be explicit through `used_live_data` and `fallback_reason`.
- Provider output must be numeric by the time it reaches fusion.

## Files

- [profile-contract.md](profile-contract.md)
- [provider-result-contract.md](provider-result-contract.md)
- [summary-contract.md](summary-contract.md)
- [baseline-contract.md](baseline-contract.md)

Machine-readable schema files live in `schemas/`.

