// Research the system implements, grouped by feature (/method, "Forschungsgrundlage").
// Group names are localised; paper titles stay in their original language.
// Full list with the file per mechanism and the examined-but-not-built papers: docs/references.md.
import type { Lang } from "@sv/contracts";

export interface PaperRef {
  cite: string;
  title: string;
  url: string;
}

export interface RefGroup {
  name: Record<Lang, string>;
  papers: PaperRef[];
}

export const REFERENCE_GROUPS: RefGroup[] = [
  {
    name: { de: "Verhandlung und Moderation", en: "Negotiation and moderation" },
    papers: [
      {
        cite: "Du et al. 2023",
        title: "Improving Factuality and Reasoning in Language Models through Multiagent Debate",
        url: "https://arxiv.org/abs/2305.14325",
      },
      {
        cite: "Liang et al. 2023",
        title: "Encouraging Divergent Thinking in Large Language Models through Multi-Agent Debate",
        url: "https://arxiv.org/abs/2305.19118",
      },
      {
        cite: "Becker et al. 2025",
        title: "Stay Focused: Problem Drift in Multi-Agent Debate",
        url: "https://arxiv.org/abs/2502.19559",
      },
      {
        cite: "Zhang et al. 2025",
        title: "Key Decision-Makers in Multi-Agent Debates: Who Holds the Power?",
        url: "https://arxiv.org/abs/2511.11040",
      },
      {
        cite: "Tessler et al. 2024",
        title: "AI can help humans find common ground in democratic deliberation",
        url: "https://doi.org/10.1126/science.adq2852",
      },
      {
        cite: "Bakker et al. 2022",
        title:
          "Fine-tuning language models to find agreement among humans with diverse preferences",
        url: "https://arxiv.org/abs/2211.15006",
      },
    ],
  },
  {
    name: { de: "Rote Linien statt Konsenszwang", en: "Red lines, no forced consensus" },
    papers: [
      {
        cite: "Sharma et al. 2023",
        title: "Towards Understanding Sycophancy in Language Models",
        url: "https://arxiv.org/abs/2310.13548",
      },
      {
        cite: "Weng, Chen, Wang 2025",
        title: "Do as We Do, Not as You Think: the Conformity of Large Language Models",
        url: "https://arxiv.org/abs/2501.13381",
      },
      {
        cite: "Abdelnabi et al. 2023",
        title:
          "Cooperation, Competition, and Maliciousness: LLM-Stakeholders Interactive Negotiation",
        url: "https://arxiv.org/abs/2309.17234",
      },
    ],
  },
  {
    name: { de: "Vetospieler und Koalitionen", en: "Veto players and coalitions" },
    papers: [
      {
        cite: "Tsebelis 2002",
        title: "Veto Players: How Political Institutions Work",
        url: "https://doi.org/10.1515/9781400831456",
      },
      {
        cite: "Weible, Sabatier, McQueen 2009",
        title: "Themes and Variations: Taking Stock of the Advocacy Coalition Framework",
        url: "https://doi.org/10.1111/j.1541-0072.2008.00299.x",
      },
    ],
  },
  {
    name: { de: "Prüfung von Aussagen und Zahlen", en: "Claim and figure checking" },
    papers: [
      {
        cite: "Gao et al. 2023",
        title: "Enabling Large Language Models to Generate Text with Citations (ALCE)",
        url: "https://arxiv.org/abs/2305.14627",
      },
      {
        cite: "Rashkin et al. 2023",
        title: "Measuring Attribution in Natural Language Generation Models (AIS)",
        url: "https://arxiv.org/abs/2112.12870",
      },
      {
        cite: "Min et al. 2023",
        title:
          "FActScore: Fine-grained Atomic Evaluation of Factual Precision in Long Form Text Generation",
        url: "https://arxiv.org/abs/2305.14251",
      },
      {
        cite: "Wanner et al. 2024",
        title: "A Closer Look at Claim Decomposition",
        url: "https://arxiv.org/abs/2403.11903",
      },
      {
        cite: "Venktesh et al. 2024",
        title: "QuanTemp: A real-world open-domain benchmark for fact-checking numerical claims",
        url: "https://arxiv.org/abs/2403.17169",
      },
      {
        cite: "Zheng et al. 2023",
        title: "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena",
        url: "https://arxiv.org/abs/2306.05685",
      },
      {
        cite: "Panickssery, Bowman, Feng 2024",
        title: "LLM Evaluators Recognize and Favor Their Own Generations",
        url: "https://arxiv.org/abs/2404.13076",
      },
      {
        cite: "Verga et al. 2024",
        title:
          "Replacing Judges with Juries: Evaluating LLM Generations with a Panel of Diverse Models",
        url: "https://arxiv.org/abs/2404.18796",
      },
    ],
  },
  {
    name: { de: "Stichtag und Leakage", en: "Cutoff date and leakage" },
    papers: [
      {
        cite: "Halawi et al. 2024",
        title: "Approaching Human-Level Forecasting with Language Models",
        url: "https://arxiv.org/abs/2402.18563",
      },
      {
        cite: "Sarkar, Vafa 2024",
        title: "Lookahead Bias in Pretrained Language Models",
        url: "https://conference.nber.org/conf_papers/f205530/f205530.pdf",
      },
      {
        cite: "Gao, Jiang, Yan 2025",
        title: "Detecting Lookahead Bias in LLM Forecasts",
        url: "https://arxiv.org/abs/2512.23847",
      },
      {
        cite: "Kapoor, Narayanan 2023",
        title: "Leakage and the reproducibility crisis in machine-learning-based science",
        url: "https://doi.org/10.1016/j.patter.2023.100804",
      },
      {
        cite: "Paleka et al. 2025",
        title: "Pitfalls in Evaluating Language Model Forecasters",
        url: "https://arxiv.org/abs/2506.00723",
      },
    ],
  },
  {
    name: { de: "Prognose bei kleinem n", en: "Small-n forecasting" },
    papers: [
      {
        cite: "Kahneman, Lovallo 1993",
        title: "Timid Choices and Bold Forecasts: A Cognitive Perspective on Risk Taking",
        url: "https://doi.org/10.1287/mnsc.39.1.17",
      },
      {
        cite: "Flyvbjerg 2008",
        title:
          "Curbing Optimism Bias and Strategic Misrepresentation in Planning: Reference Class Forecasting in Practice",
        url: "https://doi.org/10.1080/09654310701747936",
      },
      {
        cite: "Lovallo, Clarke, Camerer 2012",
        title:
          "Robust analogizing and the outside view: two empirical tests of case-based decision making",
        url: "https://doi.org/10.1002/smj.962",
      },
      {
        cite: "Brown, Cai, DasGupta 2001",
        title: "Interval Estimation for a Binomial Proportion",
        url: "https://doi.org/10.1214/ss/1009213286",
      },
      {
        cite: "Bradley, Schwartz, Hashino 2008",
        title:
          "Sampling Uncertainty and Confidence Intervals for the Brier Score and Brier Skill Score",
        url: "https://doi.org/10.1175/2007WAF2007049.1",
      },
    ],
  },
  {
    name: { de: "Backtest SV-OG 2018", en: "SV-OG 2018 backtest" },
    papers: [
      {
        cite: "Klüver 2009",
        title: "Measuring Interest Group Influence Using Quantitative Text Analysis",
        url: "https://doi.org/10.1177/1465116509346782",
      },
      {
        cite: "Dür, Bernhagen, Marshall 2015",
        title: "Interest Group Success in the European Union: When (and Why) Does Business Lose?",
        url: "https://doi.org/10.1177/0010414014565890",
      },
      {
        cite: "Diesenreiter, Wendt 2021",
        title: "Austria (Health Politics in Europe: A Handbook)",
        url: "https://doi.org/10.1093/oso/9780198860525.003.0028",
      },
      {
        cite: "Van Mulders et al. 2026",
        title: "Digital Pantheon: Simulating and Auditing Coalition Formation with LLM Agents",
        url: "https://arxiv.org/abs/2607.15095",
      },
    ],
  },
  {
    name: { de: "Personas und Modellwahl", en: "Personas and model choice" },
    papers: [
      {
        cite: "Taubenfeld et al. 2024",
        title: "Systematic Biases in LLM Simulations of Debates",
        url: "https://arxiv.org/abs/2402.04049",
      },
      {
        cite: "Lamparth et al. 2024",
        title:
          "Human vs. Machine: Behavioral Differences Between Expert Humans and Language Models in Wargame Simulations",
        url: "https://arxiv.org/abs/2403.03407",
      },
      {
        cite: "Zhang et al. 2025",
        title:
          "Stop Overvaluing Multi-Agent Debate: We Must Rethink Evaluation and Embrace Model Heterogeneity",
        url: "https://arxiv.org/abs/2502.08788",
      },
      {
        cite: "Hu, Collier 2024",
        title: "Quantifying the Persona Effect in LLM Simulations",
        url: "https://arxiv.org/abs/2402.10811",
      },
      {
        cite: "Tunstall et al. 2022",
        title: "Efficient Few-Shot Learning Without Prompts (SetFit)",
        url: "https://arxiv.org/abs/2209.11055",
      },
    ],
  },
  {
    name: { de: "Personennamen", en: "Person names" },
    papers: [
      {
        cite: "Ehrmann et al. 2020",
        title:
          "Overview of CLEF HIPE 2020: Named Entity Recognition and Linking on Historical Newspapers",
        url: "https://doi.org/10.1007/978-3-030-58219-7_21",
      },
      {
        cite: "Staab et al. 2024",
        title: "Large Language Models are Advanced Anonymizers",
        url: "https://arxiv.org/abs/2402.13846",
      },
    ],
  },
  {
    name: { de: "Debattenqualität und Inspector", en: "Debate quality and inspector" },
    papers: [
      {
        cite: "Steenbergen et al. 2003",
        title: "Measuring Political Deliberation: A Discourse Quality Index",
        url: "https://doi.org/10.1057/palgrave.cep.6110002",
      },
      {
        cite: "Shizgal et al. 2026",
        title:
          "From DQI to C-DQI: Automatic Codebook Generation and Evaluation for Measuring Computational Discourse Quality Index",
        url: "https://arxiv.org/abs/2610.27937",
      },
      {
        cite: "Epperson et al. 2025",
        title: "Interactive Debugging and Steering of Multi-Agent AI Systems (AGDebugger)",
        url: "https://arxiv.org/abs/2503.02068",
      },
    ],
  },
];
