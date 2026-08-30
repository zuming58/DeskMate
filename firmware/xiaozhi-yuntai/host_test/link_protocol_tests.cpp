#include "link_protocol.h"

#include <algorithm>
#include <cctype>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

namespace {

int failures = 0;

void Check(bool passed, const char* expression, int line) {
    if (passed) return;
    std::cerr << "line " << line << ": CHECK failed: " << expression << '\n';
    ++failures;
}

#define CHECK(expression) Check((expression), #expression, __LINE__)

struct GoldenVector {
    std::string name;
    std::string expect;
    std::string hex;
};

std::string ReadAll(const char* path) {
    std::ifstream input(path, std::ios::binary);
    std::ostringstream output;
    output << input.rdbuf();
    CHECK(input.good() || input.eof());
    return output.str();
}

std::string JsonField(const std::string& object, const char* field) {
    const std::string marker = std::string("\"") + field + "\":\"";
    const auto begin = object.find(marker);
    if (begin == std::string::npos) return {};
    const auto value_begin = begin + marker.size();
    const auto end = object.find('"', value_begin);
    return end == std::string::npos ? std::string{}
                                    : object.substr(value_begin, end - value_begin);
}

std::vector<GoldenVector> LoadGoldenVectors() {
    const auto json = ReadAll(GOLDEN_VECTORS_PATH);
    std::vector<GoldenVector> vectors;
    std::size_t position = 0;
    while ((position = json.find("{\"name\":", position)) !=
           std::string::npos) {
        const auto end = json.find('}', position);
        CHECK(end != std::string::npos);
        if (end == std::string::npos) break;
        const auto object = json.substr(position, end - position + 1);
        vectors.push_back({JsonField(object, "name"),
                           JsonField(object, "expect"),
                           JsonField(object, "hex")});
        position = end + 1;
    }
    return vectors;
}

std::vector<std::uint8_t> FromHex(const std::string& text) {
    CHECK((text.size() % 2u) == 0);
    std::vector<std::uint8_t> bytes;
    for (std::size_t index = 0; index + 1 < text.size(); index += 2) {
        const auto hex_value = [](char value) -> unsigned {
            if (value >= '0' && value <= '9') return value - '0';
            return static_cast<unsigned>(std::toupper(
                       static_cast<unsigned char>(value))) -
                   static_cast<unsigned>('A') + 10u;
        };
        bytes.push_back(static_cast<std::uint8_t>(
            (hex_value(text[index]) << 4u) | hex_value(text[index + 1])));
    }
    return bytes;
}

bool SameWire(const deskmate::xiaozhi::LinkWireFrame& wire,
              const std::vector<std::uint8_t>& bytes) {
    return wire.length == bytes.size() &&
           std::equal(bytes.begin(), bytes.end(), wire.bytes.begin());
}

bool Feed(deskmate::xiaozhi::LinkStreamParser& parser,
          const std::vector<std::uint8_t>& bytes, std::uint32_t now_ms,
          deskmate::xiaozhi::LinkFrame& frame) {
    bool accepted = false;
    for (const auto byte : bytes) {
        accepted = parser.Push(byte, now_ms, frame) || accepted;
    }
    return accepted;
}

void RecomputeCrc(std::vector<std::uint8_t>& bytes) {
    using namespace deskmate::xiaozhi;
    const auto payload_length = ReadLe16(bytes.data() + 12);
    const auto crc = LinkCrc16CcittFalse(bytes.data() + 4,
                                         10u + payload_length);
    WriteLe16(bytes.data() + kLinkHeaderBytes + payload_length, crc);
}

void GoldenVectorsAreTheWireAuthority() {
    using namespace deskmate::xiaozhi;
    const auto vectors = LoadGoldenVectors();
    CHECK(vectors.size() == 15);
    for (const auto& vector : vectors) {
        const auto bytes = FromHex(vector.hex);
        LinkStreamParser parser;
        LinkFrame frame{};
        const bool accepted = Feed(parser, bytes, 1, frame);
        if (vector.expect == "frame" ||
            vector.expect == "semantic_error_unknown_type") {
            CHECK(accepted);
            LinkWireFrame encoded{};
            CHECK(EncodeLinkFrame(frame, encoded));
            CHECK(SameWire(encoded, bytes));
        } else {
            CHECK(!accepted);
        }
        if (vector.expect == "drop_version") {
            CHECK(parser.diagnostics().version_errors == 1);
        } else if (vector.expect == "drop_flags") {
            CHECK(parser.diagnostics().flags_errors == 1);
        } else if (vector.expect == "drop_reserved") {
            CHECK(parser.diagnostics().reserved_errors == 1);
        } else if (vector.expect == "drop_crc") {
            CHECK(parser.diagnostics().crc_errors == 1);
        } else if (vector.expect == "drop_length_and_resync") {
            CHECK(parser.diagnostics().length_errors == 1);
        }
    }
}

void CrcAndFrameValidationAreExact() {
    using namespace deskmate::xiaozhi;
    const std::uint8_t check[] = {'1', '2', '3', '4', '5', '6', '7', '8', '9'};
    CHECK(LinkCrc16CcittFalse(check, sizeof(check)) == 0x29b1);

    LinkFrame frame{};
    frame.type = static_cast<std::uint8_t>(LinkMessageType::kHello);
    frame.sequence = 1;
    LinkWireFrame wire{};
    CHECK(EncodeLinkFrame(frame, wire));
    frame.sequence = 0;
    CHECK(!EncodeLinkFrame(frame, wire));
    frame.sequence = 1;
    frame.reserved = 1;
    CHECK(!EncodeLinkFrame(frame, wire));
    frame.reserved = 0;
    frame.flag = static_cast<LinkFrameFlag>(0x03);
    CHECK(!EncodeLinkFrame(frame, wire));

    for (unsigned error = 1; error <= 6; ++error) {
        CHECK(EncodeLinkError(4, error, static_cast<LinkErrorCode>(error), wire));
        CHECK(wire.bytes[5] == static_cast<std::uint8_t>(LinkFrameFlag::kError));
        CHECK(ReadLe16(wire.bytes.data() + 12) == 1);
        CHECK(wire.bytes[kLinkHeaderBytes] == error);
    }
}

void FragmentedConcatenatedNoiseAndTimeoutRecover() {
    using namespace deskmate::xiaozhi;
    const auto vectors = LoadGoldenVectors();
    const auto hello = FromHex(vectors[0].hex);
    const auto capabilities = FromHex(vectors[2].hex);

    LinkStreamParser fragmented;
    LinkFrame frame{};
    CHECK(!Feed(fragmented,
                std::vector<std::uint8_t>(hello.begin(), hello.begin() + 7),
                10, frame));
    CHECK(Feed(fragmented,
               std::vector<std::uint8_t>(hello.begin() + 7, hello.end()),
               11, frame));
    CHECK(frame.type == static_cast<std::uint8_t>(LinkMessageType::kHello));

    LinkStreamParser concatenated;
    std::vector<std::uint8_t> both = hello;
    both.insert(both.end(), capabilities.begin(), capabilities.end());
    unsigned accepted = 0;
    for (const auto byte : both) {
        if (concatenated.Push(byte, 20, frame)) ++accepted;
    }
    CHECK(accepted == 2);

    LinkStreamParser noisy;
    std::vector<std::uint8_t> startup_noise = {
        0x45, 0x53, 0x50, 0x2d, 0x52, 0x4f, 0x4d, 0x0d, 0x0a, 'D', 'M'};
    startup_noise.insert(startup_noise.end(), hello.begin(), hello.end());
    CHECK(Feed(noisy, startup_noise, 30, frame));
    CHECK(noisy.diagnostics().framing_errors >= 1);

    LinkStreamParser timed_out;
    CHECK(!Feed(timed_out,
                std::vector<std::uint8_t>(hello.begin(), hello.begin() + 8),
                40, frame));
    timed_out.Expire(140);
    CHECK(timed_out.diagnostics().inter_byte_timeouts == 1);
    CHECK(!Feed(timed_out,
                std::vector<std::uint8_t>(hello.begin() + 8, hello.end()),
                141, frame));
    CHECK(Feed(timed_out, hello, 142, frame));
}

void InvalidMagicAndZeroSequenceResynchronize() {
    using namespace deskmate::xiaozhi;
    const auto vectors = LoadGoldenVectors();
    auto bad_magic = FromHex(vectors[0].hex);
    bad_magic[0] = 0;
    const auto good = FromHex(vectors[2].hex);
    bad_magic.insert(bad_magic.end(), good.begin(), good.end());
    LinkStreamParser parser;
    LinkFrame frame{};
    CHECK(Feed(parser, bad_magic, 1, frame));
    CHECK(frame.type ==
          static_cast<std::uint8_t>(LinkMessageType::kGetCapabilities));

    auto zero_sequence = FromHex(vectors[2].hex);
    std::fill(zero_sequence.begin() + 8, zero_sequence.begin() + 12, 0);
    RecomputeCrc(zero_sequence);
    LinkStreamParser zero_parser;
    CHECK(!Feed(zero_parser, zero_sequence, 2, frame));
    CHECK(zero_parser.diagnostics().sequence_errors == 1);
    CHECK(Feed(zero_parser, good, 3, frame));

    auto bad_crc = FromHex(vectors[13].hex);
    bad_crc.insert(bad_crc.end(), good.begin(), good.end());
    LinkStreamParser crc_parser;
    CHECK(Feed(crc_parser, bad_crc, 4, frame));
    CHECK(crc_parser.diagnostics().crc_errors == 1);
    CHECK(frame.type ==
          static_cast<std::uint8_t>(LinkMessageType::kGetCapabilities));

    auto oversized = FromHex(vectors[14].hex);
    oversized.insert(oversized.end(), good.begin(), good.end());
    LinkStreamParser length_parser;
    CHECK(Feed(length_parser, oversized, 5, frame));
    CHECK(length_parser.diagnostics().length_errors == 1);
}

}  // namespace

int main() {
    GoldenVectorsAreTheWireAuthority();
    CrcAndFrameValidationAreExact();
    FragmentedConcatenatedNoiseAndTimeoutRecover();
    InvalidMagicAndZeroSequenceResynchronize();
    if (failures != 0) {
        std::cerr << "link_protocol_tests: " << failures << " failure(s)\n";
        return 1;
    }
    std::cout << "link_protocol_tests: PASS\n";
    return 0;
}
