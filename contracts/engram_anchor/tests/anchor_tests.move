#[test_only]
module engram_anchor::anchor_tests;

use engram_anchor::anchor;
use sui::clock;

fun h(b: u8): vector<u8> {
    let mut v = vector[];
    let mut i = 0;
    while (i < 32) { v.push_back(b); i = i + 1; };
    v
}

#[test]
fun anchors_first_and_child_commits() {
    let mut ctx = tx_context::dummy();
    let c = clock::create_for_testing(&mut ctx);
    anchor::anchor(h(9), h(1), h(2), vector[], b"blob", &c, &ctx);
    anchor::anchor(h(9), h(3), h(4), h(1), b"blob2", &c, &ctx);
    c.destroy_for_testing();
}

#[test, expected_failure(abort_code = anchor::EBadHashLength)]
fun rejects_short_root() {
    let mut ctx = tx_context::dummy();
    let c = clock::create_for_testing(&mut ctx);
    anchor::anchor(h(9), h(1), b"short", vector[], b"blob", &c, &ctx);
    c.destroy_for_testing();
}
