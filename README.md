# Ledger — small money-lending books

A single-browser app for a small lending business: borrowers, loans, collections, and expenses. No server and no monthly fee. Data stays in the browser you open it in. Host it on GitHub Pages and open the link when you need it.

## What it tracks

- Borrowers (name, phone, place)
- Loans
  - Flat installment (interest on full principal, equal payments)
  - Reducing EMI
  - Monthly interest only, principal at the end
- Collections (interest first, principal only, or interest only)
- Expenses by category
- Dashboard: outstanding principal, interest collected, expenses, net
- JSON backup export and import

Interest rate is entered as **percent per month**, which is how many small lenders quote it.

## Host on GitHub Pages

1. Create a new public repository on GitHub, for example `lending-ledger`.
2. Upload these files to the repository root: `index.html`, `styles.css`, `app.js`, `README.md`.
3. In the repo, open **Settings → Pages**.
4. Under **Build and deployment**, set Source to **Deploy from a branch**, branch **main**, folder **/ (root)**. Save.
5. After a minute or two, the site is at `https://YOUR-USERNAME.github.io/lending-ledger/`.

Bookmark that link. It works on a phone browser too.

## Important limits

- Data is stored in **this browser only** (localStorage). Clearing site data, or opening the link in another browser, will not show the same books until you import a backup.
- Use **Export backup** after every collection day. Keep the JSON file in Google Drive or email it to yourself.
- On a new phone: open the site, then **Import backup**.
- This is a private book, not a regulated NBFC system. It does not send SMS, calculate GST, or lock the screen.

## Daily use

1. Add borrowers.
2. Disburse a loan (principal, monthly rate, tenure, product).
3. On collection day, open **Collect**, pick the loan, enter the amount received.
4. Add travel, rent, salary, and other costs under **Expenses**.
5. Check **Reports** for interest minus expenses.
