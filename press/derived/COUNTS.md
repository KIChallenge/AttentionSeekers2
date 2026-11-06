# Press archive counts

Database: `presse.db`, run 2026-11-05 22:44, model `gpt-6-sol`.
Only counts and metadata; no press text.

| Institution                 | role                | FTS pages | candidates | passages | rows | support | oppose | conditional | neutral | pre 2018-09-14 | train | heldout |
| --------------------------- | ------------------- | --------: | ---------: | -------: | ---: | ------: | -----: | ----------: | ------: | -------------: | ----: | ------: |
| Sozialversicherung (SV)     | social_insurance    |     18686 |       1140 |      129 |   51 |      30 |     18 |           0 |       3 |             34 |    41 |      10 |
| Gesundheitsministerium (GM) | ministry_health     |      6587 |       1047 |       65 |   34 |      23 |      7 |           2 |       2 |             19 |    24 |      10 |
| Ärztekammer (ÄK)            | medical_chamber     |      8384 |       1058 |      114 |   92 |      35 |     52 |           1 |       4 |             56 |    72 |      20 |
| Vertragsärzt:innen (VÄ)     | contract_physicians |      4607 |        921 |      122 |   15 |       9 |      6 |           0 |       0 |             10 |    12 |       3 |
| Wahlärzt:innen (WA)         | elective_physicians |      2436 |        509 |      133 |    6 |       5 |      1 |           0 |       0 |              5 |     5 |       1 |
| Krankenanstalten (KA)       | hospitals           |      2975 |        810 |      118 |   53 |      42 |      5 |           2 |       4 |             26 |    39 |      14 |
| Pflegevertretung (PF)       | nursing             |      1343 |        603 |      102 |   23 |      15 |      6 |           1 |       1 |             10 |    19 |       4 |
| Patientenvertretung (PV)    | patients            |      1678 |        724 |      102 |   69 |      39 |     23 |           3 |       4 |             32 |    47 |      22 |
| Bundesländer (BL)           | laender             |      8701 |        961 |      133 |   62 |      46 |     11 |           3 |       2 |             37 |    47 |      15 |
| Finanzministerium (FM)      | ministry_finance    |      2452 |        608 |       67 |   24 |      17 |      2 |           1 |       4 |              9 |    12 |      12 |
| Arbeiterkammer (AK)         | chamber_labour      |      2752 |        670 |      104 |   79 |      46 |     29 |           1 |       3 |             31 |    56 |      23 |
| Wirtschaftskammer (WK)      | chamber_commerce    |      1492 |        565 |       89 |   58 |      41 |     15 |           0 |       2 |             22 |    38 |      20 |
| Industrie/Pharma (IP)       | industry_pharma     |      1525 |        661 |      128 |   70 |      34 |     34 |           1 |       1 |             39 |    50 |      20 |

Pipeline: near duplicates dropped 263, quote sentences dropped 5816, person sentences masked 3155, not relevant 762, dropped by output guard 8, titles replaced by topic label 27, USD spent 20.2989, USD estimate 26.5.
