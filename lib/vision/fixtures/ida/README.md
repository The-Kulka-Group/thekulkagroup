# IDA parser fixtures

These excerpts came from public source HTML on September 6, 2026:

* `nassau-first.html` contains the result count, project table and pager from https://nassauida.org/projects-documents.
* `nassau-last.html` contains the result count, table and pager from https://nassauida.org/projects-documents?page=21.
* `suffolk-index.html` contains the first resource index from https://suffolkida.org/resources/.

The collector reads linked document metadata. These fixtures contain no PDF text. The pagination test supplies the recorded last page as the next mock response and changes its result counts to model a two-page source without making 22 requests. Error tests alter these excerpts only within disposable test cases.
