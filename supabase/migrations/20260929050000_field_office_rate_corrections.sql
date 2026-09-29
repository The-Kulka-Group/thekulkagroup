-- LA-1403. The LA-1397 golden test found field-office rows from the LA-688
-- load that do not match the rows of the C-00379 General Conditions tab they
-- cite (117 N Long Beach Rd GC's REV1.xlsx). Every row was checked against its
-- sheet row. Existing rows keep their ids: each fix is an update. Four rows the
-- sheet prices and the card lacked are added.

-- Sheet rows 94 to 100 price Electric Connect at $0. The old $500 is Office
-- Supplies (rows 109 to 114) and the old $175 a month is ISP Service (rows 166
-- to 171).
update gc_field_office_rates
   set item = 'Electric Connect', rate_basis = 'lump_sum', rate = 0, recurring_rate = null
 where item = 'Electric connect';

-- Sheet rows 102 to 107 leave Plumbing Connect at $0 or blank. Nothing on the
-- sheet backs the old $500 and $100 a month.
update gc_field_office_rates
   set item = 'Plumbing Connect', rate_basis = 'lump_sum', rate = 0, recurring_rate = null
 where item = 'Plumbing connect';

-- Sheet rows 152 to 157 price Tel/Data Service at $500 once. The old $2,000
-- and $150 a month match no row. Tel/Data Bill (rows 173 to 178) is $100 a month.
update gc_field_office_rates
   set item = 'Tel/Data Service', rate_basis = 'lump_sum', rate = 500, recurring_rate = null
 where item = 'Phone/data connect';

-- Sheet rows 123 to 143 price Field Office Computers at $2,750 a person, and
-- rows 145 to 150 price Field Office Fit Out at $2,500 an office. The old rows
-- had the two figures swapped.
update gc_field_office_rates
   set item = 'Field Office Fit-Out (Kitchens, Plan Tables, Racks, Conference Table)', rate = 2500
 where item = 'Office fit-out/furniture allowance';

update gc_field_office_rates set rate = 2750 where item = 'Computers';

-- Sheet rows 183 to 188 price Trailer Alarm at $150 a month, not $100.
update gc_field_office_rates set rate = 150 where item = 'Trailer alarm, central station monitoring';

-- Rows the sheet prices and the card lacked.
insert into gc_field_office_rates (category, item, rate_basis, rate, recurring_rate)
values
  ('office_setup', 'Office Supplies', 'lump_sum', 500, null),
  ('office_setup', 'Networking/Printer Setup', 'lump_sum', 3200, null),
  ('office_setup', 'ISP Service', 'monthly', 175, null),
  ('office_setup', 'Tel/Data Bill', 'monthly', 100, null);
