# Every imported budget line carries a role

Each line imported from a budget is marked as scope, lump, allowance, takeoff helper or
duplicate. Only scope, lump and allowance lines may feed a benchmark, and a takeoff
helper never can.

This exists because of one file. The Villa at Glen Cove 50% CD budget prices thirteen
rows as perimeter times height, which is wall area rather than floor area, at a flat $250
per square foot. That is $50.2M of its $50.7M base cost. The remaining scope in the file
is about $510,000 of lockers, mailboxes, sauna equipment and pavers. A pipeline that
totals lines without classifying them would learn that Kulka builds at $250 per square
foot and be wrong by two orders of magnitude. West Shore Road supplies the duplicate
case, carrying the same sanitary sewer allowance twice, once at $125 and once at
$125,000.

The alternative was to reject defective files outright. We rejected that because the
usable scope inside a defective file is still real, and because a file-level verdict
throws away the good lines with the bad.
