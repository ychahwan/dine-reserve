#!/usr/bin/env bash
#
# Kamix — executable backend test suite.
#
# Drives the exact Convex functions the UI calls against the live deployment
# using `convex run` with `--identity` to simulate signed-in diners/owners.
# Prints one PASS/FAIL line per scenario. Exit code is the number of failures.
#
#   bash scripts/test-backend.sh          # run everything
#   PHASE=1 bash scripts/test-backend.sh   # discovery + auth + E2E booking
#   PHASE=2 bash scripts/test-backend.sh   # queue / waitlist / notifications
#   PHASE=3 bash scripts/test-backend.sh   # reviews / security / claim-demo
#
set -u
cd "$(dirname "$0")/.."

CLI="node node_modules/convex/bin/main.js"
FLAGS=(--typecheck disable --codegen disable)
STATE=/tmp/kamix-test-state.sh
PASS=0; FAIL=0; FAILED=()

# ---------------------------------------------------------------- helpers
runfn() { node node_modules/convex/bin/main.js run "$@" --typecheck disable --codegen disable; }

# read-only inline query -> trimmed result (last line)
iq() {
  node node_modules/convex/bin/main.js run --inline-query "$1" --typecheck disable --codegen disable 2>&1 \
    | grep -oE "'[a-z0-9]{24,}'|[0-9]+|\"[a-z0-9]{24,}\"" | tail -1 | tr -d "'\""
}

check() { # name expect args...
  local name="$1" expect="$2"; shift 2
  local out
  out=$(runfn "$@" 2>&1)
  if printf '%s' "$out" | grep -qF "$expect"; then
    PASS=$((PASS+1)); echo "PASS  | $name"
  else
    FAIL=$((FAIL+1)); FAILED+=("$name")
    echo "FAIL  | $name | expected '$expect'"
    echo "       out: $(printf '%s' "$out" | tr '\n' ' ' | head -c 420)"
  fi
}

check_absent() { # name must-not-contain args...
  local name="$1" absent="$2"; shift 2
  local out
  out=$(runfn "$@" 2>&1)
  if printf '%s' "$out" | grep -qF "$absent"; then
    FAIL=$((FAIL+1)); FAILED+=("$name")
    echo "FAIL  | $name | must NOT contain '$absent'"
    echo "       out: $(printf '%s' "$out" | tr '\n' ' ' | head -c 420)"
  else
    PASS=$((PASS+1)); echo "PASS  | $name"
  fi
}

id() { printf '{"subject":"%s"}' "$1"; }

# ---------------------------------------------------------------- fixtures
TODAY=$(date +%F)
TOMORROW=$(date -d tomorrow +%F 2>/dev/null || date -v+1d +%F)

TRULLO=$(iq "const r = await ctx.db.query('restaurants').filter((q) => q.eq(q.field('name'), 'Trullo')).first(); return r?._id;")
SAKURA=$(iq "const r = await ctx.db.query('restaurants').filter((q) => q.eq(q.field('name'), 'Sakura House')).first(); return r?._id;")
CASA=$(iq "const r = await ctx.db.query('restaurants').filter((q) => q.eq(q.field('name'), 'Casa Oliva')).first(); return r?._id;")
MARCO=$(iq "const u = await ctx.db.query('users').filter((q) => q.eq(q.field('email'), 'marco@seatly.demo')).first(); return u?._id;")
AVA=$(iq "const u = await ctx.db.query('users').filter((q) => q.eq(q.field('email'), 'ava@seatly.demo')).first(); return u?._id;")
LEO=$(iq "const u = await ctx.db.query('users').filter((q) => q.eq(q.field('email'), 'leo@seatly.demo')).first(); return u?._id;")
PARIS=$(iq "const r = await ctx.db.query('restaurants').filter((q) => q.eq(q.field('city'), 'Paris')).first(); return r?._id;")
AVATRULLO=$(iq "const b = await ctx.db.query('bookings').collect(); const x = b.find((x) => x.code === 'AV4K2P'); return x?._id;")
AVASAKURA=$(iq "const b = await ctx.db.query('bookings').collect(); const x = b.find((x) => x.code === 'SA3T9Q'); return x?._id;")

PHASE="${PHASE:-all}"

# ================================================================ PHASE 1
if [ "$PHASE" = "all" ] || [ "$PHASE" = "1" ]; then
  echo "── Phase 1 · discovery · auth · E2E booking ──────────────────────────"

  # B-1..B-6  public search
  check "B-1 search lists restaurants"  "Sakura House" restaurants:search '{}'
  check "B-2 cuisine filter"            "Trullo"      restaurants:search '{"cuisine":"Italian"}'
  check_absent "B-2b cuisine excludes"  "Sakura"      restaurants:search '{"cuisine":"Italian"}'
  check "B-3 city filter"               "La Brasa"    restaurants:search '{"city":"Rome"}'
  check "B-4 solo filter"               "Sakura House" restaurants:search '{"solo":true}'
  check_absent "B-4b solo excludes Trullo" "Trullo"   restaurants:search '{"solo":true}'
  check "B-5 dietary filter"            "Casa Oliva"  restaurants:search '{"dietary":"vegan"}'
  check "B-6 free-text search"          "Sakura House" restaurants:search '{"q":"omakase"}'

  # B-7..B-8  detail + availability
  check "B-7 restaurant detail (menu)"  "Cacio e pepe" restaurants:get "{\"id\":\"$TRULLO\"}"
  check "B-8 availability forDate"      "sections"    availability:forDate "{\"restaurantId\":\"$TRULLO\",\"date\":\"$TODAY\"}"

  # B-1 auth identity plumbing
  check "AUTH identity maps to user"    "Marco Bianchi" users:currentUser '{}' --identity "$(id "$MARCO")"
  check "AUTH signed-out is null"       "null"        users:currentUser '{}'

  # E-1..E-2 ownership gating
  check "E-1 owner sees bookings"       "AV4K2P"      bookings:byRestaurant "{\"restaurantId\":\"$TRULLO\"}" --identity "$(id "$MARCO")"
  check "E-2 non-owner sees nothing"    "[]"          bookings:byRestaurant "{\"restaurantId\":\"$TRULLO\"}" --identity "$(id "$AVA")"
  check "E-3 insights stats"            "covers: 6"   bookings:stats "{\"restaurantId\":\"$TRULLO\",\"days\":30}" --identity "$(id "$MARCO")"
  check "E-4 cancellation policy"       "cancellationPolicyHours: 24" restaurants:setCancellationPolicy "{\"restaurantId\":\"$TRULLO\",\"hours\":24}" --identity "$(id "$MARCO")"

  # G-3..G-4 profile + favorites
  check "G-3 dining preferences"        "prefs"       users:updateProfile '{"prefs":{"dietary":["Vegetarian","Vegan"],"seating":["inside","outside"],"occasions":["birthday"]}}' --identity "$(id "$AVA")"
  check "G-4a favorite on"              "favorited: true" users:toggleFavorite "{\"restaurantId\":\"$CASA\"}" --identity "$(id "$AVA")"
  check "G-4b favorite off"             "favorited: false" users:toggleFavorite "{\"restaurantId\":\"$CASA\"}" --identity "$(id "$AVA")"

  # C-1..C-4  E2E: owner builds a 2-seat restaurant, diner books directly
  check "C-1 owner creates restaurant"  "TEST"        restaurants:create '{"name":"Test Harness Table","cuisine":"Test","city":"Testville","address":"1 Test St","features":{"inside":true,"outside":false,"bar":false,"smoking":false,"parking":false,"liveMusic":false,"soloFriendly":true}}' --identity "$(id test-owner-1)"
  RID=$(iq "const r = await ctx.db.query('restaurants').withIndex('by_owner', (q) => q.eq('ownerId', 'test-owner-1')).order('desc').first(); return r?._id;")
  SEC=$(iq "const s = await ctx.db.query('sections').withIndex('by_restaurant', (q) => q.eq('restaurantId', '$RID')).first(); return s?._id;")
  check "C-2a add 2-seat section"       "section"     restaurants:addSection "{\"restaurantId\":\"$RID\",\"name\":\"Tasting counter\",\"kind\":\"inside\",\"smoking\":false,\"capacity\":2}" --identity "$(id test-owner-1)"
  check "C-2b remove default section"   "null"        restaurants:deleteSection "{\"id\":\"$SEC\"}" --identity "$(id test-owner-1)"
  check "C-2c save hours"               "null"        restaurants:saveHours "{\"restaurantId\":\"$RID\",\"hours\":[{\"dayOfWeek\":0,\"open\":\"17:00\",\"close\":\"22:00\",\"enabled\":true},{\"dayOfWeek\":1,\"open\":\"17:00\",\"close\":\"22:00\",\"enabled\":true},{\"dayOfWeek\":2,\"open\":\"17:00\",\"close\":\"22:00\",\"enabled\":true},{\"dayOfWeek\":3,\"open\":\"17:00\",\"close\":\"22:00\",\"enabled\":true},{\"dayOfWeek\":4,\"open\":\"17:00\",\"close\":\"22:00\",\"enabled\":true},{\"dayOfWeek\":5,\"open\":\"17:00\",\"close\":\"22:00\",\"enabled\":true},{\"dayOfWeek\":6,\"open\":\"17:00\",\"close\":\"22:00\",\"enabled\":true}]}" --identity "$(id test-owner-1)"
  check "C-3 slots materialize"         '"created":'  availability:ensureForDate "{\"restaurantId\":\"$RID\",\"date\":\"$TOMORROW\"}" --identity "$(id test-owner-1)"
  check "C-4 direct booking 19:00"      '"status": "confirmed"' bookings:createBooking "{\"restaurantId\":\"$RID\",\"date\":\"$TOMORROW\",\"time\":\"19:00\",\"partySize\":2,\"name\":\"Test Diner One\"}" --identity "$(id test-diner-1)"
  check "C-8 invalid party size"        "Party size must be between 1 and 20" bookings:createBooking "{\"restaurantId\":\"$RID\",\"date\":\"$TOMORROW\",\"time\":\"19:00\",\"partySize\":0,\"name\":\"Nope\"}" --identity "$(id test-diner-1)"
  check "C-9 signed-out booking"        "Please sign in to book" bookings:createBooking "{\"restaurantId\":\"$RID\",\"date\":\"$TOMORROW\",\"time\":\"19:00\",\"partySize\":2,\"name\":\"Nope\"}"
  check "C-10 owner sees E2E booking"   "Test Diner One" bookings:byRestaurant "{\"restaurantId\":\"$RID\"}" --identity "$(id test-owner-1)"

  # persistence for later phases
  {
    echo "RID='$RID'"; echo "TOMORROW='$TOMORROW'"
  } > "$STATE"
  echo "state: RID=$RID"
fi

# ================================================================ PHASE 2
if [ "$PHASE" = "all" ] || [ "$PHASE" = "2" ]; then
  [ -f "$STATE" ] && . "$STATE"
  echo "── Phase 2 · queue · waitlist · notifications ────────────────────────"

  # C-5  queue: 4 diners race for the last 2 seats at 21:30 (no later fallback)
  for d in test-diner-2 test-diner-3 test-diner-4 test-diner-5; do
    runfn queue:enqueue "{\"restaurantId\":\"$RID\",\"date\":\"$TOMORROW\",\"time\":\"21:30\",\"partySize\":1,\"name\":\"$d\"}" --identity "$(id "$d")" >/dev/null 2>&1
  done
  sleep 8
  check "C-5 queue books exactly 2"     "total: 2"    --inline-query "const b = await ctx.db.query('bookings').withIndex('by_restaurant_date', (q) => q.eq('restaurantId', '$RID').eq('date', '$TOMORROW')).collect(); return { total: b.filter((x) => x.time === '21:30').length };"
  check "C-5b overflow diner failed"    "failed"      queue:myEntries '{}' --identity "$(id test-diner-4)"

  # D-1  waitlist on the now sold-out slot
  check "D-1 join waitlist (sold out)"  "waiting"     waitlist:join "{\"restaurantId\":\"$RID\",\"date\":\"$TOMORROW\",\"time\":\"21:30\",\"partySize\":1,\"name\":\"Test Diner Six\"}" --identity "$(id test-diner-6)"

  # D-2  cancel a queued booking -> seats freed -> waitlist promoted
  D2BOOK=$(iq "const b = await ctx.db.query('bookings').withIndex('by_user', (q) => q.eq('userId', 'test-diner-2')).order('desc').first(); return b?._id;")
  check "C-6 cancellation restores seats" '"status": "cancelled"' bookings:cancelBooking "{\"bookingId\":\"$D2BOOK\"}" --identity "$(id test-diner-2)"
  check "D-2 waitlist promoted"         "notified"    waitlist:byRestaurant "{\"restaurantId\":\"$RID\"}" --identity "$(id test-owner-1)"

  # D-3  automatic booking event + D-4 diner alert + D-5 read state
  check "D-3 auto booking event"        "booking_created" notifications:forRestaurant "{\"restaurantId\":\"$RID\"}" --identity "$(id test-owner-1)"
  D1BOOK=$(iq "const b = await ctx.db.query('bookings').withIndex('by_user', (q) => q.eq('userId', 'test-diner-1')).order('desc').first(); return b?._id;")
  check "D-4 diner check-in alert"      "on_my_way"   notifications:sendForBooking "{\"bookingId\":\"$D1BOOK\",\"type\":\"on_my_way\"}" --identity "$(id test-diner-1)"
  check "D-5a unread badge"             "2"           notifications:unreadCount "{\"restaurantId\":\"$RID\"}" --identity "$(id test-owner-1)"
  check "D-5b mark all read"            "0"           notifications:markAllRead "{\"restaurantId\":\"$RID\"}" --identity "$(id test-owner-1)"

  # G-1..G-2 group invites on the direct booking
  check "G-1 guest confirms seat"       "Nadia"       bookings:confirmGuest "{\"bookingId\":\"$D1BOOK\",\"name\":\"Nadia\"}" --identity "$(id test-diner-7)"
  check "G-2 duplicate guest rejected"  "already confirmed" bookings:confirmGuest "{\"bookingId\":\"$D1BOOK\",\"name\":\"Nadia\"}" --identity "$(id test-diner-7)"
fi

# ================================================================ PHASE 3
if [ "$PHASE" = "all" ] || [ "$PHASE" = "3" ]; then
  echo "── Phase 3 · reviews · security · claim-demo ─────────────────────────"

  # F-1..F-5  verified reviews (Ava's past Trullo visit)
  check "F-1 owner marks visit completed" '"status": "completed"' bookings:updateStatus "{\"bookingId\":\"$AVATRULLO\",\"status\":\"completed\"}" --identity "$(id "$MARCO")"
  check "F-2 verified review created"   "rating: 5"   reviews:create "{\"bookingId\":\"$AVATRULLO\",\"rating\":5,\"text\":\"Harness test review.\"}" --identity "$(id "$AVA")"
  check "F-3 one review per booking"    "already reviewed" reviews:create "{\"bookingId\":\"$AVATRULLO\",\"rating\":4}" --identity "$(id "$AVA")"
  check "F-4a can't review others' visit" "only review your own visits" reviews:create "{\"bookingId\":\"$AVATRULLO\",\"rating\":5}" --identity "$(id "$LEO")"
  check "F-4b can't review future visit"  "after your visit" reviews:create "{\"bookingId\":\"$AVASAKURA\",\"rating\":4}" --identity "$(id "$AVA")"
  check "F-5 rating aggregates"         "avg: 5"      reviews:listForRestaurant "{\"restaurantId\":\"$TRULLO\"}"
  check "F-5b detail shows rating"      "avg: 5"      restaurants:get "{\"id\":\"$TRULLO\"}"

  # E-5..E-6  demo-claim guardrails
  check "E-6 real restaurant can't be claimed" "can't be claimed" restaurants:claimDemo "{\"id\":\"$PARIS\"}" --identity "$(id test-owner-9)"
  check "E-5 claim demo restaurant"     "test-owner-9" restaurants:claimDemo "{\"id\":\"$CASA\"}" --identity "$(id test-owner-9)"
  check "E-5b new owner sees it"        "isOwner: true" restaurants:get "{\"id\":\"$CASA\"}" --identity "$(id test-owner-9)"
fi

# ---------------------------------------------------------------- summary
echo ""
echo "─────────────────────────────────────────────────────────────"
echo "RESULT: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  printf 'FAILED: %s\n' "${FAILED[@]}"
fi
exit "$FAIL"
