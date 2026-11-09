# Student Toolkit

An offline-first, installable student app: **attendance**, **GPA/CGPA**, **timetable** and **exam countdowns**. Plain HTML/CSS/JS, no build step, no login, no backend. Everything is saved in your browser (localStorage).

Live: https://abinashspace.github.io/student-toolkit/

## Features
- **Attendance** – one-tap Present/Absent with Undo, colour-coded rings (safe / borderline / at risk), “can miss” / “must attend” advice, global target plus optional per-subject target.
- **Dashboard** – overall attendance, subjects at risk, next class today, next exam.
- **GPA / CGPA** – semesters and courses (credits + grade), 10-point (O, A+, A, B+, B, C, RA/F) and 4.0 presets or a custom scale, credit-weighted CGPA, and a target-CGPA helper that tells you the SGPA you need next semester (or that it is impossible).
- **Timetable** – weekly view by day, today’s current/next class highlighted, tap Present/Absent on today’s linked classes.
- **Exams** – live countdowns, sorted, finished exams moved to a Done section.
- **Backup** – export/import a JSON file; reset all data. Light/dark/system theme. Installable (PWA) and works offline.

Data from v1 (attendance-only) is migrated automatically; the old v1 entry is kept as a fallback copy.

## Tests
```
for t in test/*.js; do node "$t"; done
```
