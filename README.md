# Student Toolkit

An offline-first, installable student app: **attendance**, **GPA/CGPA**, **timetable** and **exam countdowns**. Plain HTML/CSS/JS, no build step, no login, no backend. Everything is saved in your browser (localStorage).

Live: https://abinashspace.github.io/student-toolkit/

## Features
- **Attendance** – one-tap Present/Absent with Undo, colour-coded rings (safe / borderline / at risk), “can miss” / “must attend” advice, global target plus optional per-subject target. A short note records the Anna University 75% rule (65–74% only with a medical/sports certificate). The app does not certify eligibility.
- **Dashboard** – overall attendance, subjects at risk, next class today, next exam.
- **GPA / CGPA** – semesters and courses (credits + grade), presets for a generic 10-point scale, a 4.0 scale, **Anna University R2021** and **R2017**, or a custom scale. Credit-weighted CGPA, and a target-CGPA helper that tells you the SGPA you need next semester (or that it is impossible). AU presets leave U/RA (and SA, W/WD) out of GPA until the course is cleared, as in the official regulations.
- **Percentage** – for the R2021 preset, shows **Percentage = CGPA × 10** (Anna University R2021 clause 15.5.3). The official R2017 regulations have no conversion clause, so no percentage is shown for that preset. The unofficial (CGPA − 0.5) × 10 formula is not used.
- **Degree classification** – for AU presets, an estimate of First Class with Distinction (CGPA ≥ 8.50, no arrears, not prevented for attendance), First Class (≥ 6.50 in R2021, ≥ 7.00 in R2017), or Second Class, plus what you still need. This is an estimate, not an official classification.
- **End-semester marks needed** – enter your internal marks and a course type (R2017 theory 20+80; R2021 theory 40+60, laboratory 60+40, theory + lab 50+50; or custom). Shows the minimum end-semester marks to pass: at least 50% overall and at least 45% in the exam.
- **Timetable** – weekly view by day, today’s current/next class highlighted, tap Present/Absent on today’s linked classes.
- **Exams** – live countdowns, sorted, finished exams moved to a Done section.
- **Backup** – export/import a JSON file; reset all data. Light theme by default, dark as an opt-in. Installable (PWA) and works offline.

Data from v1 (attendance-only) is migrated automatically; the old v1 entry is kept as a fallback copy. Existing GPA scales are never silently switched to an Anna University preset.

Official sources for the Anna University rules:

- [Undergraduate Academic Regulations 2021](https://cac.annauniv.edu/aidetails/reg/Approved%20R2021/Undergraduate%20Programme%20-%20Academic%20Regulations%202021.pdf) (clause 7 attendance, 14.1 passing, 15.1 grades, 15.5 GPA/CGPA and clause 15.5.3 percentage, 16.2 classification)
- [R2021 amendments, 16 October 2023](https://cac.annauniv.edu/aidetails/ammend/30th%20AC/01.%20UG%20Amendments%20R2021-16.10.2023.pdf)
- [Undergraduate Academic Regulations 2017](https://cac.annauniv.edu/aidetails/reg/2017/Approved%20R2017/UG%20Programme%20-%20Academic%20Regulations%202017.pdf) (clause 7 attendance, 11.2/14.1 marks and passing, 15.1 grades, 16.2 classification — no percentage conversion clause)

## Tests
```
for t in test/*.js; do node "$t"; done
```

## Credits

UI font: [Outfit](https://github.com/Outfitio/Outfit-Fonts), vendored in `fonts/` under the SIL Open Font License (see `fonts/OFL.txt`). The theme is inspired by quick-commerce grocery apps; no third-party logos, names or images are used.
Design pass guided by [unslop](https://github.com/heydamir/unslop) by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), CC BY 4.0.
