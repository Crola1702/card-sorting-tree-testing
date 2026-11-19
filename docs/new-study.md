# Publish a new study (5 minutes)

No code changes. You need write access to the GitHub repository.

1. **Copy an existing study** from `public/studies/` as a template:
   - Card sort: `tarjetas-wiki.json`
   - Tree test: `arbol-a.csv` (you can edit it in Excel or Google Sheets)
2. **Rename it.** The file name becomes the link: `becas-2027.csv` → `…/#/s/becas-2027`.
   Use only letters, digits, `-` and `_`.
3. **Edit the content**:
   - Card sort: `title`, `intro` and one `card` per item, each with a unique `id`.
   - Tree test: one `node` per menu entry (`parent` empty for the top level), and one `task` per question with
     the `id` of the correct node(s) in `correct`, separated by `|`.
   - Optional: a `consent` text if the default one does not fit your study (it must say what is collected).
4. **Upload it** to `public/studies/` on the `main` branch (GitHub web: *Add file → Upload files*).
5. **Wait 2–3 minutes** for the *CI and deploy* workflow in the Actions tab to finish.
6. **Open the link yourself** on your phone: `https://<user>.github.io/<repo>/#/s/<file-name>`.
   If something is wrong in the file, the page shows the exact error (repeated id, missing parent, etc.).
   Fix the file and upload it again.
7. **Share the link** with participants.

Tips:

- Do not change ids once participants have started; results reference them.
- To compare two versions (A/B), create both study files and a small split file that points to them
  (see "Split link" in the README). Share only the split link.
- To close a study, delete its file. Collected answers stay in the database.
- Export results with `npm run export` (see the README).
