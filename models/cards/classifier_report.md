# In-character classifier report

Base `sentence-transformers/paraphrase-multilingual-mpnet-base-v2`, SetFit contrastive step on 32 paragraphs/class, LR head on all 5812 train paragraphs. Held-out = statements dated >= 2023-01-01 (1421 paragraphs).

Macro F1: **SetFit 0.215**, frozen-embedding baseline 0.240. Accuracy 0.270 (baseline 0.315).

| institution | n held-out | precision | recall | F1 | F1 frozen |
|---|---:|---:|---:|---:|---:|
| social_insurance | 151 | 0.25 | 0.26 | 0.26 | 0.28 |
| medical_chamber | 77 | 0.16 | 0.34 | 0.21 | 0.23 |
| contract_physicians | 39 | 0.25 | 0.18 | 0.21 | 0.19 |
| hospitals | 53 | 0.06 | 0.13 | 0.08 | 0.14 |
| nursing | 57 | 0.26 | 0.56 | 0.36 | 0.30 |
| patients | 23 | 0.05 | 0.26 | 0.09 | 0.08 |
| laender | 711 | 0.79 | 0.28 | 0.41 | 0.49 |
| ministry_finance | 54 | 0.14 | 0.37 | 0.21 | 0.26 |
| chamber_labour | 103 | 0.11 | 0.17 | 0.13 | 0.21 |
| chamber_commerce | 153 | 0.19 | 0.18 | 0.19 | 0.21 |

Confusion matrix (rows = true, columns = predicted):

| true \ pred | social_insurance | medical_chamber | contract_physicians | hospitals | nursing | patients | laender | ministry_finance | chamber_labour | chamber_commerce |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| social_insurance | 40 | 24 | 4 | 9 | 10 | 12 | 8 | 14 | 21 | 9 |
| medical_chamber | 3 | 26 | 1 | 9 | 10 | 5 | 4 | 8 | 6 | 5 |
| contract_physicians | 1 | 8 | 7 | 8 | 7 | 4 | 1 | 0 | 1 | 2 |
| hospitals | 6 | 4 | 1 | 7 | 7 | 4 | 6 | 2 | 7 | 9 |
| nursing | 2 | 0 | 0 | 11 | 32 | 1 | 4 | 0 | 2 | 5 |
| patients | 5 | 1 | 0 | 2 | 6 | 6 | 0 | 1 | 0 | 2 |
| laender | 74 | 73 | 6 | 47 | 34 | 48 | 200 | 76 | 83 | 70 |
| ministry_finance | 8 | 1 | 0 | 4 | 1 | 6 | 5 | 20 | 5 | 4 |
| chamber_labour | 7 | 12 | 4 | 10 | 9 | 14 | 12 | 5 | 18 | 12 |
| chamber_commerce | 12 | 17 | 5 | 20 | 7 | 17 | 13 | 12 | 22 | 28 |

Excluded (too few paragraphs, train/held-out): ministry_health 5/8, elective_physicians 0/0

## Character n-gram head and ensemble

Macro F1: **ensemble 0.322**, char TF-IDF alone 0.383, SetFit alone 0.215, frozen embeddings 0.240. Chance for 10 balanced classes is 0.10. The scorer ships the best of the three (`mode` in persona_labels.json: **char**); that choice was made on the held-out split, so treat its F1 as slightly optimistic.

| institution | n held-out | precision | recall | F1 ensemble | F1 char | F1 SetFit |
|---|---:|---:|---:|---:|---:|---:|
| social_insurance | 151 | 0.41 | 0.38 | 0.40 | 0.43 | 0.26 |
| medical_chamber | 77 | 0.26 | 0.39 | 0.31 | 0.39 | 0.21 |
| contract_physicians | 39 | 0.36 | 0.21 | 0.26 | 0.43 | 0.21 |
| hospitals | 53 | 0.09 | 0.17 | 0.12 | 0.12 | 0.08 |
| nursing | 57 | 0.33 | 0.70 | 0.45 | 0.49 | 0.36 |
| patients | 23 | 0.06 | 0.22 | 0.09 | 0.15 | 0.09 |
| laender | 711 | 0.81 | 0.57 | 0.67 | 0.72 | 0.41 |
| ministry_finance | 54 | 0.25 | 0.43 | 0.32 | 0.36 | 0.21 |
| chamber_labour | 103 | 0.26 | 0.36 | 0.30 | 0.42 | 0.13 |
| chamber_commerce | 153 | 0.38 | 0.25 | 0.30 | 0.31 | 0.19 |

Confusion matrix, char (rows = true, columns = predicted):

| true \ pred | social_insurance | medical_chamber | contract_physicians | hospitals | nursing | patients | laender | ministry_finance | chamber_labour | chamber_commerce |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| social_insurance | 59 | 11 | 2 | 5 | 4 | 5 | 43 | 3 | 10 | 9 |
| medical_chamber | 4 | 31 | 0 | 7 | 4 | 5 | 13 | 2 | 9 | 2 |
| contract_physicians | 0 | 6 | 12 | 7 | 5 | 2 | 3 | 0 | 4 | 0 |
| hospitals | 1 | 2 | 0 | 8 | 6 | 5 | 16 | 0 | 12 | 3 |
| nursing | 1 | 0 | 0 | 6 | 38 | 1 | 4 | 0 | 5 | 2 |
| patients | 1 | 2 | 0 | 1 | 2 | 7 | 3 | 0 | 7 | 0 |
| laender | 41 | 18 | 3 | 25 | 24 | 22 | 494 | 25 | 37 | 22 |
| ministry_finance | 6 | 1 | 0 | 3 | 1 | 1 | 18 | 20 | 2 | 2 |
| chamber_labour | 2 | 4 | 0 | 5 | 5 | 6 | 18 | 2 | 54 | 7 |
| chamber_commerce | 9 | 8 | 0 | 11 | 9 | 14 | 46 | 5 | 14 | 37 |

Confusion matrix, ensemble (rows = true, columns = predicted):

| true \ pred | social_insurance | medical_chamber | contract_physicians | hospitals | nursing | patients | laender | ministry_finance | chamber_labour | chamber_commerce |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| social_insurance | 58 | 16 | 4 | 6 | 4 | 7 | 24 | 9 | 14 | 9 |
| medical_chamber | 1 | 30 | 1 | 8 | 9 | 5 | 9 | 3 | 6 | 5 |
| contract_physicians | 0 | 8 | 8 | 11 | 6 | 2 | 0 | 0 | 3 | 1 |
| hospitals | 3 | 2 | 0 | 9 | 7 | 5 | 14 | 1 | 5 | 7 |
| nursing | 1 | 0 | 0 | 7 | 40 | 1 | 2 | 0 | 5 | 1 |
| patients | 2 | 2 | 0 | 2 | 6 | 5 | 2 | 0 | 3 | 1 |
| laender | 49 | 37 | 4 | 31 | 27 | 33 | 403 | 44 | 51 | 32 |
| ministry_finance | 9 | 0 | 0 | 2 | 1 | 2 | 11 | 23 | 5 | 1 |
| chamber_labour | 4 | 5 | 2 | 7 | 10 | 12 | 15 | 4 | 37 | 7 |
| chamber_commerce | 13 | 14 | 3 | 14 | 10 | 18 | 20 | 8 | 14 | 39 |
