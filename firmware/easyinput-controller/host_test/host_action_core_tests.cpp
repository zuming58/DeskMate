#include <algorithm>
#include <array>
#include <cstdint>
#include <iostream>
#include <string>

#include "host_action_core.h"

using namespace deskmate::easyinput;

namespace {
int failures = 0;
void check(bool passed, const char* expression, int line) {
    if (passed) return;
    std::cerr << __FILE__ << ':' << line << ": CHECK failed: "
              << expression << '\n';
    ++failures;
}
#define CHECK(expression) check((expression), #expression, __LINE__)

void host_action_golden_vector() {
    const std::string uuid = "123e4567-e89b-12d3-a456-426614174000";
    CHECK(is_canonical_host_action_uuid(uuid));
    CHECK(!is_canonical_host_action_uuid(
        "123E4567-e89b-12d3-a456-426614174000"));
    CHECK(!is_canonical_host_action_uuid(
        "123e4567-e89b-12d3-a456-42661417400g"));

    HostCommandStream stream;
    CHECK(stream.start(HostCommandKind::HostAction, uuid, 7));
    CHECK(!stream.start(HostCommandKind::HostAction, uuid, 7));
    std::array<uint8_t, kAppCommandPayloadBytes> report{};
    CHECK(stream.encode_next(report));
    CHECK(report[0] == 0x05);
    CHECK(report[1] == 0);
    CHECK(report[2] == 1);
    CHECK(report[3] == 36);
    CHECK(std::equal(uuid.begin(), uuid.end(), report.begin() + 4));
    CHECK(std::all_of(report.begin() + 40, report.end(),
                      [](uint8_t value) { return value == 0; }));
    CHECK(stream.mark_sent());
    CHECK(!stream.pending());
}

void fixed_text_boundaries_and_golden_vectors() {
    CHECK(!is_valid_fixed_text({}));
    CHECK(is_valid_fixed_text("a"));
    CHECK(is_valid_fixed_text("line\nnext\tvalue"));
    CHECK(is_valid_fixed_text("DeskMate \xE4\xB8\xAD\xE6\x96\x87"));
    CHECK(!is_valid_fixed_text(std::string(1, '\0')));
    CHECK(!is_valid_fixed_text(std::string(1, '\x01')));
    CHECK(!is_valid_fixed_text(std::string(1, '\x7f')));
    CHECK(!is_valid_fixed_text(std::string(1, '\xc3')));
    CHECK(!is_valid_fixed_text(std::string("\xc0\x80", 2)));
    CHECK(!is_valid_fixed_text(std::string(961, 'x')));

    for (const size_t size : {size_t{1}, size_t{59}, size_t{60},
                              size_t{960}}) {
        const std::string text(size, 'x');
        HostCommandStream stream;
        CHECK(stream.start(HostCommandKind::FixedText, text, 9));
        const uint8_t expected_total = static_cast<uint8_t>(
            (size + kAppCommandChunkBytes - 1) / kAppCommandChunkBytes);
        CHECK(stream.total_chunks() == expected_total);
        size_t reconstructed = 0;
        for (uint8_t index = 0; index < expected_total; ++index) {
            std::array<uint8_t, kAppCommandPayloadBytes> report{};
            CHECK(stream.encode_next(report));
            CHECK(report[0] == 0x01);
            CHECK(report[1] == index);
            CHECK(report[2] == expected_total);
            const size_t expected_count =
                std::min(kAppCommandChunkBytes, size - reconstructed);
            CHECK(report[3] == expected_count);
            CHECK(std::all_of(report.begin() + 4,
                              report.begin() + 4 + expected_count,
                              [](uint8_t value) { return value == 'x'; }));
            CHECK(std::all_of(report.begin() + 4 + expected_count,
                              report.end(),
                              [](uint8_t value) { return value == 0; }));
            reconstructed += expected_count;
            CHECK(stream.mark_sent() == (index + 1 == expected_total));
        }
        CHECK(reconstructed == size);
        CHECK(!stream.pending());
    }
}

void abort_clears_old_lifetime_without_replay() {
    HostCommandStream stream;
    CHECK(stream.start(HostCommandKind::FixedText, std::string(60, 'a'), 4));
    std::array<uint8_t, kAppCommandPayloadBytes> report{};
    CHECK(stream.encode_next(report));
    CHECK(!stream.mark_sent());
    stream.abort();
    CHECK(!stream.pending());
    CHECK(!stream.encode_next(report));
    CHECK(stream.start(HostCommandKind::HostAction,
                       "00000000-0000-0000-0000-000000000001", 5));
    CHECK(stream.epoch() == 5);
}
}  // namespace

int main() {
    host_action_golden_vector();
    fixed_text_boundaries_and_golden_vectors();
    abort_clears_old_lifetime_without_replay();
    if (failures != 0) {
        std::cerr << "host_action_core_tests: " << failures
                  << " failure(s)\n";
        return 1;
    }
    std::cout << "host_action_core_tests: PASS\n";
    return 0;
}
