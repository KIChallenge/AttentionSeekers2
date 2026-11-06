# Literatur nach Funktion

Welche Forschung im System umgesetzt ist, gruppiert nach Funktion. Aufgenommen ist ein Paper nur,
wenn der Mechanismus im Code oder in einem Laufergebnis existiert; die Zeile "umgesetzt in" nennt
Datei oder Seite. Titel, Autor:innen, Jahr, Venue und Link wurden am 2026-11-05 gegen arXiv und
Crossref geprüft (Projektordner `research/papers.md`, Einträge 1 bis 35 und Tabelle "lower
priority", und `research/papers-addendum.md`, Einträge 36 bis 81). Die Nummern in eckigen Klammern
verweisen auf diese Einträge. Was eine Entscheidung geprägt hat, aber nicht gebaut ist, steht am
Ende unter "Geprüft, nicht umgesetzt".

## 1. Verhandlungsprotokoll und Moderation

- **[1]** Du, Li, Torralba, Tenenbaum, Mordatch. 2023. _Improving Factuality and Reasoning in
  Language Models through Multiagent Debate._ ICML 2024. https://arxiv.org/abs/2305.14325
  umgesetzt in: Rundenprotokoll, in dem jeder Agent die anderen liest und revidiert
  (`packages/engine/src/runner.ts`, `phases.ts`), ohne erzwungene Konvergenz (siehe Abschnitt 2).
- **[2]** Liang, He, Jiao, Wang, Wang, Wang, Yang, Shi, Tu. 2023. _Encouraging Divergent Thinking
  in Large Language Models through Multi-Agent Debate._ EMNLP 2024. https://arxiv.org/abs/2305.19118
  umgesetzt in: ein eigener Agent je Institution plus Moderator ohne Position
  (`packages/engine/src/agent.ts`, `moderator.ts`).
- **[6]** Becker, Kaesberg, Stephan, Wahle, Ruas, Gipp. 2025. _Stay Focused: Problem Drift in
  Multi-Agent Debate._ Findings of EACL 2026. https://arxiv.org/abs/2502.19559
  umgesetzt in: Relevanz-Gate gegen Mandat und Austauschthema (`quality/checks.ts`,
  `relevanceCheck`), Moderation schließt festgefahrene Austausche (`runner.ts`, `STALE_NOVELTY`),
  festes Rundenlimit.
- **[7]** Zhang, Zheng, Liu, Ding, Cheng, Hao, Zheng. 2025. _Key Decision-Makers in Multi-Agent
  Debates: Who Holds the Power?_ arXiv:2511.11040. https://arxiv.org/abs/2511.11040
  umgesetzt in: Sprechreihenfolge pro Runde zufällig aus dem Seed und protokolliert
  (`phases.ts`, `shuffle`; `room.ts`, `speakingOrder: "randomised_recorded"`).
- **[13]** Tessler, Bakker, Jarrett, Sheahan, Chadwick, Koster et al. 2024. _AI can help humans
  find common ground in democratic deliberation._ Science 386(6719).
  https://doi.org/10.1126/science.adq2852
  umgesetzt in: Moderator-Zusammenfassung nennt offene Konflikte vor Einigungen
  (`moderator.ts`, `exchanges.ts` `mergeConflicts`, `apps/web/components/run/round-blocks.tsx`).
- **[lower priority]** Bakker et al. 2022. _Fine-tuning language models to find agreement among
  humans with diverse preferences._ NeurIPS 2022. https://arxiv.org/abs/2211.15006
  umgesetzt in: wie [13], Konflikte zuerst; Akteursauswahl des Moderators mit Begründung.

## 2. Sykophanz, Konformität und rote Linien

- **[3]** Sharma, Tong, Korbak, Duvenaud, Askell, Bowman et al. 2023. _Towards Understanding
  Sycophancy in Language Models._ ICLR 2024. https://arxiv.org/abs/2310.13548
  umgesetzt in: rote Linien je Agent, die nicht verhandelbar sind; eine Verhandlung darf ohne
  Ergebnis enden (Ausgang `no_result`, `docs/backtest-svog-2018.md`).
- **[5]** Weng, Chen, Wang. 2025. _Do as We Do, Not as You Think: the Conformity of Large Language
  Models._ ICLR 2025. https://arxiv.org/abs/2501.13381
  umgesetzt in: starke Persona aus Dossier und Stellungnahmen plus Lesson nach jeder Runde
  (`packages/engine/config/dossiers/`, `runner.ts`); kein Konsenszwang.
- **[33]** Abdelnabi, Gomaa, Sivaprasad, Schönherr, Fritz. 2023. _Cooperation, Competition, and
  Maliciousness: LLM-Stakeholders Interactive Negotiation._ COLM 2024.
  https://arxiv.org/abs/2309.17234
  umgesetzt in: ein Paket gilt nur, wenn es die Entscheidungsregel und alle Vetospieler erfüllt
  (`packages/engine/src/coalition.ts`); rote Linien als Untergrenze je Partei.

## 3. Politikprozess-Theorie

- **[59]** Tsebelis. 2002. _Veto Players: How Political Institutions Work._ Princeton University
  Press. https://doi.org/10.1515/9781400831456
  umgesetzt in: Koalitionskalkül ohne LLM, Vetospieler, minimale Gewinnkoalitionen, Blockierer
  (`packages/engine/src/coalition.ts`); Regel `veto_players` im Backtest.
- **[60]** Weible, Sabatier, McQueen. 2009. _Themes and Variations: Taking Stock of the Advocacy
  Coalition Framework._ Policy Studies Journal 37(1). https://doi.org/10.1111/j.1541-0072.2008.00299.x
  umgesetzt in: Stufen der roten Linien `deep_core`, `policy_core`, `secondary`
  (`packages/contracts/src/agents.ts`).

## 4. Prüfung von Aussagen und Zahlen

- **[42]** Gao, Yen, Yu, Chen. 2023. _Enabling Large Language Models to Generate Text with
  Citations (ALCE)._ EMNLP 2023. https://arxiv.org/abs/2305.14627
  umgesetzt in: jeder Claim wird gegen die zitierte Passage geprüft (`packages/engine/src/expert.ts`).
- **[43]** Rashkin, Nikolaev, Lamm, Aroyo, Collins, Das et al. 2023. _Measuring Attribution in
  Natural Language Generation Models (AIS)._ Computational Linguistics.
  https://arxiv.org/abs/2112.12870
  umgesetzt in: Claims werden einzeln und mit Quelle gespeichert (`packages/contracts/src/claims.ts`),
  Zitat-Chips am Text.
- **[44]** Min, Krishna, Lyu, Lewis, Yih, Koh et al. 2023. _FActScore: Fine-grained Atomic
  Evaluation of Factual Precision in Long Form Text Generation._ EMNLP 2023.
  https://arxiv.org/abs/2305.14251
  umgesetzt in: Zerlegung in atomare Claims, Zustand pro Claim statt pro Wortmeldung
  (`expert.ts`, `runner.ts`).
- **[45]** Wanner, Ebner, Jiang, Dredze, Van Durme. 2024. _A Closer Look at Claim Decomposition._
  \*SEM 2024. https://arxiv.org/abs/2403.11903
  umgesetzt in: das Zerlegungsmodell wird je Claim protokolliert (`claims.ts`, `decompositionModel`).
- **[32]** Venktesh, Anand, Anand, Setty. 2024. _QuanTemp: A real-world open-domain benchmark for
  fact-checking numerical claims._ SIGIR 2024. https://arxiv.org/abs/2403.17169
  umgesetzt in: Zahlen-Abgleich im Audit (`quality/checks.ts`, `groundingCheck`, `numbersIn`);
  Kosten und Wirkung aus deterministischer Arithmetik (`packages/engine/src/impact.ts`).
- **[29]** Zheng, Chiang, Sheng, Zhuang, Wu, Zhuang et al. 2023. _Judging LLM-as-a-Judge with
  MT-Bench and Chatbot Arena._ NeurIPS 2023 Datasets and Benchmarks. https://arxiv.org/abs/2306.05685
  umgesetzt in: feste Rubrik, Temperatur 0, fester Seed für den Audit-Judge (`quality/judge.ts`).
- **[30]** Panickssery, Bowman, Feng. 2024. _LLM Evaluators Recognize and Favor Their Own
  Generations._ NeurIPS 2024. https://arxiv.org/abs/2404.13076
  umgesetzt in: Judge aus der jeweils anderen Modellfamilie (`quality/judge.ts`,
  `test/seats.test.ts`); zweiter Verifier aus anderer Familie (`SV_VERIFIER_MODEL`).
- **[lower priority]** Verga et al. 2024. _Replacing Judges with Juries: Evaluating LLM
  Generations with a Panel of Diverse Models._ arXiv:2404.18796. https://arxiv.org/abs/2404.18796
  umgesetzt in: zwei unabhängige Prüfaufrufe, Uneinigkeit lässt einen Claim ungeprüft (`expert.ts`).

## 5. Zeit, Leakage und Lookahead

- **[19]** Halawi, Zhang, Yueh-Han, Steinhardt. 2024. _Approaching Human-Level Forecasting with
  Language Models._ arXiv:2402.18563. https://arxiv.org/abs/2402.18563
  umgesetzt in: as-of-Retrieval, Prädikat `date <= asOf` in jedem SQL-Zweig
  (`packages/engine/src/retrieval.ts`).
- **[28]** Sarkar, Vafa. 2024. _Lookahead Bias in Pretrained Language Models._ NBER conference
  paper. https://conference.nber.org/conf_papers/f205530/f205530.pdf
  umgesetzt in: Labels regelbasiert statt per LLM, Backtest-Treffer nur als schwache Evidenz
  (`docs/method.md`, Grenzen; `/method`).
- **[79]** Gao, Jiang, Yan. 2025. _Detecting Lookahead Bias in LLM Forecasts._ arXiv:2512.23847.
  https://arxiv.org/abs/2512.23847
  umgesetzt in: Recall-Probe je Modellfamilie ohne Kontext (`packages/engine/src/recall-probe.ts`,
  `docs/backtest-svog-2018.md`).
- **[27]** Kapoor, Narayanan. 2023. _Leakage and the reproducibility crisis in
  machine-learning-based science._ Patterns 4(9). https://doi.org/10.1016/j.patter.2023.100804
  umgesetzt in: Labels nur aus dem Gesetzgebungsprotokoll, Knowability-Datum, zeitlich saubere
  Pools (`forecasting/PREREGISTRATION.md` Abschnitte 3 und 4, `forecasting/src/svforecast/`).
- **[78]** Paleka, Goel, Geiping, Tramèr. 2025. _Pitfalls in Evaluating Language Model
  Forecasters._ arXiv:2506.00723. https://arxiv.org/abs/2506.00723
  umgesetzt in: Leakage-Prüfung des Backtests, alle Passagedaten vor dem Stichtag
  (`docs/backtest-svog-2018.md`, Setup).

## 6. Prognose bei kleinem n

- **[67]** Kahneman, Lovallo. 1993. _Timid Choices and Bold Forecasts: A Cognitive Perspective on
  Risk Taking._ Management Science 39(1). https://doi.org/10.1287/mnsc.39.1.17
  umgesetzt in: Referenzklassen-Prognose statt trainiertem Modell
  (`forecasting/src/svforecast/forecast.py`, Forecaster A).
- **[68]** Flyvbjerg. 2008. _Curbing Optimism Bias and Strategic Misrepresentation in Planning:
  Reference Class Forecasting in Practice._ European Planning Studies 16(1).
  https://doi.org/10.1080/09654310701747936
  umgesetzt in: wie [67]; Ausgabe "umgesetzt in k von n vergleichbaren Fällen".
- **[69]** Lovallo, Clarke, Camerer. 2012. _Robust analogizing and the outside view: two empirical
  tests of case-based decision making._ Strategic Management Journal 33(5).
  https://doi.org/10.1002/smj.962
  umgesetzt in: Forecaster B mit k gewichteten Analogien, nie einer (`forecast.py`, `analogs`;
  `packages/contracts/src/outcome.ts`).
- **[74]** Brown, Cai, DasGupta. 2001. _Interval Estimation for a Binomial Proportion._ Statistical
  Science 16(2). https://doi.org/10.1214/ss/1009213286
  umgesetzt in: Wilson- und Jeffreys-Intervall, Small-n-Warnung (`forecasting/src/svforecast/stats.py`,
  `/runs/[runId]/outcome`).
- **[73]** Bradley, Schwartz, Hashino. 2008. _Sampling Uncertainty and Confidence Intervals for the
  Brier Score and Brier Skill Score._ Weather and Forecasting 23(5).
  https://doi.org/10.1175/2007WAF2007049.1
  umgesetzt in: Brier und Brier Skill Score gegen die Status-quo-Basisrate mit Bootstrap-Intervall
  (`forecasting/src/svforecast/score.py`, `/method`).

## 7. Backtest SV-OG 2018

- **[52]** Klüver. 2009. _Measuring Interest Group Influence Using Quantitative Text Analysis._
  European Union Politics 10(4). https://doi.org/10.1177/1465116509346782
  umgesetzt in: Präferenzerreichung je Institution, Abstand zur Endfassung relativ zum Erstentwurf
  (`docs/backtest-svog-2018.md`, `/method`).
- **[53]** Dür, Bernhagen, Marshall. 2015. _Interest Group Success in the European Union: When (and
  Why) Does Business Lose?_ Comparative Political Studies 48(8).
  https://doi.org/10.1177/0010414014565890
  umgesetzt in: wie [52], Idealpunkt minus Ergebnis relativ zum Referenzpunkt Entwurf.
- **[62]** Diesenreiter, Wendt. 2021. _Austria._ In Immergut et al. (eds.), Health Politics in
  Europe: A Handbook. Oxford University Press. https://doi.org/10.1093/oso/9780198860525.003.0028
  umgesetzt in: vorab formulierte Hypothese "einseitig beschlossen, Simulator wird weicher" und
  Variante `government` mit Vetospieler-Regel (`docs/backtest-svog-2018.md`).
- **[81]** Van Mulders, Bogaert, Van den Poel. 2026. _Digital Pantheon: Simulating and Auditing
  Coalition Formation with LLM Agents._ arXiv:2607.15095. https://arxiv.org/abs/2607.15095
  umgesetzt in: Vergleich je Bestimmung zwischen Simulation und beschlossenem Gesetz
  (`docs/backtest-svog-2018.md`, Tabelle Result).

## 8. Personas und Modellwahl

- **[8]** Taubenfeld, Dover, Reichart, Goldstein. 2024. _Systematic Biases in LLM Simulations of
  Debates._ EMNLP 2024. https://arxiv.org/abs/2402.04049
  umgesetzt in: dieselbe Frage mit verschiedenen Modellfamilien, Modell-Bias-Ansicht
  (`runs/ensemble-wartezeiten-*`, `apps/web/lib/model-bias-data.ts`, `/topics/[topicKey]/models`).
- **[80]** Lamparth, Corso, Ganz, Mastro, Schneider, Trinkunas. 2024. _Human vs. Machine:
  Behavioral Differences Between Expert Humans and Language Models in Wargame Simulations._
  arXiv:2403.03407. https://arxiv.org/abs/2403.03407
  umgesetzt in: wie [8]; Modell je Sitz sichtbar, Ergebnis je Modellfamilie verglichen.
- **[lower priority]** Zhang et al. 2025. _Stop Overvaluing Multi-Agent Debate: We Must Rethink
  Evaluation and Embrace Model Heterogeneity._ arXiv:2502.08788. https://arxiv.org/abs/2502.08788
  umgesetzt in: mindestens zwei Modellfamilien, Modell je Sitz per Konfiguration
  (`packages/engine/src/config.ts`, `test/seats.test.ts`).
- **[lower priority]** Hu, Collier. 2024. _Quantifying the Persona Effect in LLM Simulations._
  ACL 2024. https://arxiv.org/abs/2402.10811
  umgesetzt in: Positionstreue wird gemessen statt dem Persona-Prompt vertraut
  (`models/out/persona_fidelity.json`, `models/scripts/eval_stance.py`); Grenze zum
  Temperament-Regler (`docs/method.md`, Grenzen 7).
- **[25]** Tunstall, Reimers, Jo, Bates, Korat, Wasserblat, Pereg. 2022. _Efficient Few-Shot
  Learning Without Prompts (SetFit)._ arXiv:2209.11055. https://arxiv.org/abs/2209.11055
  umgesetzt in: In-Character-Klassifikator, verglichen mit Zeichen-n-Gramm-Kopf und Ensemble
  (`models/scripts/train_classifier.py`, `add_char_head.py`, `models/cards/classifier_report.md`,
  `/models`).

## 9. Personennamen

- **[47]** Ehrmann, Romanello, Flückiger, Clematide. 2020. _Overview of CLEF HIPE 2020: Named
  Entity Recognition and Linking on Historical Newspapers._ CLEF 2020, LNCS.
  https://doi.org/10.1007/978-3-030-58219-7_21
  umgesetzt in: Maskierung ganzer Sätze, Guard schlägt bei Treffer fehl (`press/src/sv_press/guard.py`,
  `packages/engine/src/guard.ts`, `models/scripts/pii_guard.py`).
- **[50]** Staab, Vero, Balunović, Vechev. 2024. _Large Language Models are Advanced Anonymizers._
  arXiv:2402.13846. https://arxiv.org/abs/2402.13846
  umgesetzt in: Amtsbezeichnungen wie "Gesundheitsministerin" werden zur Institution umgeschrieben,
  maskierte Namen dürfen in keiner Umschreibung wiederkehren (`press/src/sv_press/guard.py`).

## 10. Debattenqualität und Transparenz

- **[36]** Steenbergen, Bächtiger, Spörndli, Steiner. 2003. _Measuring Political Deliberation: A
  Discourse Quality Index._ Comparative European Politics 1(1).
  https://doi.org/10.1057/palgrave.cep.6110002
  umgesetzt in: Audit-Dimensionen Relevanz, Responsivität, Begründung, Register
  (`quality/judge.ts`), Begründungsforderung des Moderators (`runner.ts`, `justification_demand`);
  Veränderung über Runden statt absolutem Wert (`docs/method.md`, Grenzen 8).
- **[39]** Shizgal, Keinan, Shtauber, Esquira, Aronson, Toledano et al. 2026. _From DQI to C-DQI:
  Automatic Codebook Generation and Evaluation for Measuring Computational Discourse Quality
  Index._ arXiv:2610.27937. https://arxiv.org/abs/2610.27937
  umgesetzt in: LLM-Qualitätscodierung durch eine zweite Modellfamilie (`quality/audit.ts`,
  `runs/*.quality.json`).
- **[51]** Epperson, Bansal, Dibia, Fourney, Gerrits, Zhu, Amershi. 2025. _Interactive Debugging and
  Steering of Multi-Agent AI Systems (AGDebugger)._ CHI 2025. https://arxiv.org/abs/2503.02068
  umgesetzt in: Inspector mit Prompt, Retrieval-Trace und Prüfung je Wortmeldung
  (`/runs/[runId]/inspect`).

## Geprüft, nicht umgesetzt

- **[40]** Hao et al. 2026, _Not All Flips Are Conformity._ https://arxiv.org/abs/2606.00820
  Kontrolllauf ohne Peer-Information ist als Laufart angelegt (`no_peer_control`), aber nicht gelaufen.
- **[4]** Yao et al. 2025, _Peacemaker or Troublemaker._ https://arxiv.org/abs/2509.23055
  Kalte Ratifikation in frischem Kontext ist als Schalter angelegt (`coldRatification`), standardmäßig aus.
- **[35]** Lu et al. 2026, _Agents that Matter._ https://arxiv.org/abs/2605.27621 und **[11]**
  Larooij, Törnberg 2025. https://arxiv.org/abs/2504.03274
  Ablation durch echtes Weglassen eines Agenten ist als Laufart angelegt, nicht ausgewertet.
- **[31]** Cohen et al. 2023, _LM vs LM._ https://arxiv.org/abs/2305.13281
  Kreuzverhör statt zweier unabhängiger Prüfaufrufe.
- **[26]** Hollmann et al. 2025, _TabPFN._ https://doi.org/10.1038/s41586-024-08328-6
  Kein trainiertes Modell bei diesem n.
- **[75]** Efron, Morris 1975. https://doi.org/10.1080/01621459.1975.10479864
  Shrinkage zur Elternklasse.
- **[72]** Baron et al. 2014. https://doi.org/10.1287/deca.2014.0293
  Extremisieren aggregierter Prognosen, bei diesem n nicht sinnvoll.
- **[49]** Zaratiana, Lewis, Hurn-Maloney 2026, _GLiNER2-PII._ https://arxiv.org/abs/2605.09973 und
  Benikova, Biemann, Reznicek 2014, GermEval 2014 NER.
  http://www.lrec-conf.org/proceedings/lrec2014/pdf/276_Paper.pdf
  Der Guard nutzt spaCy plus Regeln, kein eigenes NER-Modell.
- **[55]** Wilkerson, Smith, Stramp 2015. https://doi.org/10.1111/ajps.12175 und **[56]** Burgess
  et al. 2016. https://doi.org/10.1145/2939672.2939697
  Text-Reuse von Stellungnahmen ins Gesetz, auf der Episodenseite angekündigt.
- **[46]** Vladika, Schneider, Matthes 2024, _HealthFC._ https://arxiv.org/abs/2309.08503
  Smoke-Test des Verifiers auf deutschen Gesundheitsclaims.
