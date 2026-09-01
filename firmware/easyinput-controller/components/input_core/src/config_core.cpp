#include "config_core.h"
#include "host_action_core.h"

#include <algorithm>
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <limits>
#include <string>
#include <string_view>
#include <optional>
#include <utility>

namespace deskmate::easyinput {
namespace {
uint16_t u16(const uint8_t* p) { return static_cast<uint16_t>(p[0] | (p[1] << 8)); }
uint32_t u32(const uint8_t* p) { return p[0] | (p[1] << 8u) | (p[2] << 16u) | (p[3] << 24u); }
void w16(uint8_t* p, uint16_t v) { p[0] = static_cast<uint8_t>(v); p[1] = static_cast<uint8_t>(v >> 8); }
void w32(uint8_t* p, uint32_t v) { for (unsigned i = 0; i < 4; ++i) p[i] = static_cast<uint8_t>(v >> (8u * i)); }

bool hex(char c, uint8_t& out) { if (c >= '0' && c <= '9') { out = static_cast<uint8_t>(c - '0'); return true; } if (c >= 'a' && c <= 'f') { out = static_cast<uint8_t>(c - 'a' + 10); return true; } if (c >= 'A' && c <= 'F') { out = static_cast<uint8_t>(c - 'A' + 10); return true; } return false; }
bool append_utf8(uint32_t cp, std::string& out) { if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return false; if (cp <= 0x7f) out.push_back(static_cast<char>(cp)); else if (cp <= 0x7ff) { out.push_back(static_cast<char>(0xc0 | (cp >> 6))); out.push_back(static_cast<char>(0x80 | (cp & 0x3f))); } else if (cp <= 0xffff) { out.push_back(static_cast<char>(0xe0 | (cp >> 12))); out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3f))); out.push_back(static_cast<char>(0x80 | (cp & 0x3f))); } else { out.push_back(static_cast<char>(0xf0 | (cp >> 18))); out.push_back(static_cast<char>(0x80 | ((cp >> 12) & 0x3f))); out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3f))); out.push_back(static_cast<char>(0x80 | (cp & 0x3f))); } return true; }
void skip_ws(std::string_view json, size_t& pos) { while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\n' || json[pos] == '\r' || json[pos] == '\t')) ++pos; }

bool parse_string(std::string_view json, size_t& pos, std::string* out) {
  skip_ws(json, pos);
  if (pos >= json.size() || json[pos++] != '"') return false;
  if (out) out->clear();
  while (pos < json.size()) {
    const uint8_t c = static_cast<uint8_t>(json[pos++]);
    if (c == '"') return true;
    if (c < 0x20) return false;
    if (c == '\\') {
      if (pos >= json.size()) return false;
      const char escaped = json[pos++];
      char decoded = 0;
      if (escaped == '"' || escaped == '\\' || escaped == '/') decoded = escaped;
      else if (escaped == 'b') decoded = '\b';
      else if (escaped == 'f') decoded = '\f';
      else if (escaped == 'n') decoded = '\n';
      else if (escaped == 'r') decoded = '\r';
      else if (escaped == 't') decoded = '\t';
      else if (escaped == 'u') {
        if (pos + 4 > json.size()) return false;
        uint16_t first = 0; uint8_t digit = 0;
        for (int i = 0; i < 4; ++i) { if (!hex(json[pos + i], digit)) return false; first = static_cast<uint16_t>((first << 4) | digit); }
        pos += 4; uint32_t code_point = first;
        if (first >= 0xd800 && first <= 0xdbff) {
          if (pos + 6 > json.size() || json[pos] != '\\' || json[pos + 1] != 'u') return false;
          pos += 2; uint16_t second = 0;
          for (int i = 0; i < 4; ++i) { if (!hex(json[pos + i], digit)) return false; second = static_cast<uint16_t>((second << 4) | digit); }
          pos += 4; if (second < 0xdc00 || second > 0xdfff) return false;
          code_point = 0x10000u + ((static_cast<uint32_t>(first) - 0xd800u) << 10) + second - 0xdc00u;
        } else if (first >= 0xdc00 && first <= 0xdfff) return false;
        if (out && !append_utf8(code_point, *out)) return false;
        continue;
      } else return false;
      if (out) out->push_back(decoded);
      continue;
    }
    if (c <= 0x7f) { if (out) out->push_back(static_cast<char>(c)); continue; }
    const size_t count = c >= 0xc2 && c <= 0xdf ? 2 : c >= 0xe0 && c <= 0xef ? 3 : c >= 0xf0 && c <= 0xf4 ? 4 : 0;
    if (!count || pos + count - 1 > json.size()) return false;
    const uint8_t second = static_cast<uint8_t>(json[pos]);
    if ((c == 0xe0 && second < 0xa0) || (c == 0xed && second > 0x9f) || (c == 0xf0 && second < 0x90) || (c == 0xf4 && second > 0x8f)) return false;
    for (size_t i = 0; i < count - 1; ++i) if ((static_cast<uint8_t>(json[pos + i]) & 0xc0) != 0x80) return false;
    if (out) out->append(json.data() + pos - 1, count);
    pos += count - 1;
  }
  return false;
}

bool parse_value(std::string_view json, size_t& pos, unsigned depth) {
  if (depth > 12) return false;
  skip_ws(json, pos);
  if (pos >= json.size()) return false;
  if (json[pos] == '"') return parse_string(json, pos, nullptr);
  if (json[pos] == '{') {
    ++pos; skip_ws(json, pos); if (pos < json.size() && json[pos] == '}') { ++pos; return true; }
    while (pos < json.size()) { if (!parse_string(json, pos, nullptr)) return false; skip_ws(json, pos); if (pos >= json.size() || json[pos++] != ':') return false; if (!parse_value(json, pos, depth + 1)) return false; skip_ws(json, pos); if (pos < json.size() && json[pos] == '}') { ++pos; return true; } if (pos >= json.size() || json[pos++] != ',') return false; }
    return false;
  }
  if (json[pos] == '[') {
    ++pos; skip_ws(json, pos); if (pos < json.size() && json[pos] == ']') { ++pos; return true; }
    while (pos < json.size()) { if (!parse_value(json, pos, depth + 1)) return false; skip_ws(json, pos); if (pos < json.size() && json[pos] == ']') { ++pos; return true; } if (pos >= json.size() || json[pos++] != ',') return false; }
    return false;
  }
  if (json.substr(pos, 4) == "true" || json.substr(pos, 4) == "null") { pos += 4; return true; }
  if (json.substr(pos, 5) == "false") { pos += 5; return true; }
  if (json[pos] == '-') ++pos;
  if (pos >= json.size()) return false;
  if (json[pos] == '0') ++pos;
  else { if (json[pos] < '1' || json[pos] > '9') return false; while (pos < json.size() && json[pos] >= '0' && json[pos] <= '9') ++pos; }
  if (pos < json.size() && json[pos] == '.') { ++pos; if (pos >= json.size() || json[pos] < '0' || json[pos] > '9') return false; while (pos < json.size() && json[pos] >= '0' && json[pos] <= '9') ++pos; }
  if (pos < json.size() && (json[pos] == 'e' || json[pos] == 'E')) { ++pos; if (pos < json.size() && (json[pos] == '+' || json[pos] == '-')) ++pos; if (pos >= json.size() || json[pos] < '0' || json[pos] > '9') return false; while (pos < json.size() && json[pos] >= '0' && json[pos] <= '9') ++pos; }
  return true;
}

bool valid_json(std::string_view json) { size_t pos = 0; if (!parse_value(json, pos, 0)) return false; skip_ws(json, pos); return pos == json.size(); }

bool field_value(std::string_view object, std::string_view field, std::optional<std::string_view>& out) {
  out.reset(); size_t pos = 0; skip_ws(object, pos); if (pos >= object.size() || object[pos++] != '{') return false;
  skip_ws(object, pos); if (pos < object.size() && object[pos] == '}') { ++pos; skip_ws(object, pos); return pos == object.size(); }
  while (pos < object.size()) {
    std::string key; if (!parse_string(object, pos, &key)) return false; skip_ws(object, pos); if (pos >= object.size() || object[pos++] != ':') return false;
    skip_ws(object, pos); const size_t begin = pos; if (!parse_value(object, pos, 1)) return false; const size_t end = pos;
    if (key == field) { if (out.has_value()) return false; out = object.substr(begin, end - begin); }
    skip_ws(object, pos); if (pos < object.size() && object[pos] == '}') { ++pos; skip_ws(object, pos); return pos == object.size(); } if (pos >= object.size() || object[pos++] != ',') return false;
  }
  return false;
}

bool first_array_value(std::string_view array, std::optional<std::string_view>& out) {
  out.reset(); size_t pos = 0; skip_ws(array, pos); if (pos >= array.size() || array[pos++] != '[') return false; skip_ws(array, pos); if (pos < array.size() && array[pos] == ']') { ++pos; skip_ws(array, pos); return pos == array.size(); }
  const size_t begin = pos; if (!parse_value(array, pos, 1)) return false; out = array.substr(begin, pos - begin);
  while (true) { skip_ws(array, pos); if (pos < array.size() && array[pos] == ']') { ++pos; skip_ws(array, pos); return pos == array.size(); } if (pos >= array.size() || array[pos++] != ',') return false; if (!parse_value(array, pos, 1)) return false; }
}

bool string_value(std::string_view raw, std::string& out) { size_t pos = 0; if (!parse_string(raw, pos, &out)) return false; skip_ws(raw, pos); return pos == raw.size(); }
bool boolean_value(std::string_view raw, bool& out) { size_t begin = 0; skip_ws(raw, begin); size_t end = raw.size(); while (end > begin && (raw[end - 1] == ' ' || raw[end - 1] == '\n' || raw[end - 1] == '\r' || raw[end - 1] == '\t')) --end; const auto value = raw.substr(begin, end - begin); if (value == "true") { out = true; return true; } if (value == "false") { out = false; return true; } return false; }
bool integer_value(std::string_view raw, int& out) { size_t begin = 0; skip_ws(raw, begin); size_t end = raw.size(); while (end > begin && (raw[end - 1] == ' ' || raw[end - 1] == '\n' || raw[end - 1] == '\r' || raw[end - 1] == '\t')) --end; raw = raw.substr(begin, end - begin); if (raw.empty()) return false; size_t pos = 0; bool negative = false; if (raw[pos] == '-') { negative = true; ++pos; } if (pos == raw.size()) return false; const uint64_t limit = negative ? 2147483648ULL : 2147483647ULL; uint64_t value = 0; for (; pos < raw.size(); ++pos) { if (raw[pos] < '0' || raw[pos] > '9') return false; const uint64_t digit = static_cast<uint64_t>(raw[pos] - '0'); if (value > (limit - digit) / 10u) return false; value = value * 10u + digit; } out = negative ? (value == 2147483648ULL ? std::numeric_limits<int>::min() : -static_cast<int>(value)) : static_cast<int>(value); return true; }

bool parse_hotkey(const std::string& value, ConfigAction& action) { if (value.empty() || value.size() > 64) return false; uint8_t modifiers = 0, usage = 0; size_t begin = 0; while (begin <= value.size()) { const size_t end = value.find('+', begin); const std::string token = value.substr(begin, end == std::string::npos ? end : end - begin); if (token == "Ctrl" || token == "Control") modifiers |= 1; else if (token == "Shift") modifiers |= 2; else if (token == "Alt" || token == "Option") modifiers |= 4; else if (token == "Meta" || token == "Command" || token == "Super") modifiers |= 8; else if (token == "Return" || token == "Enter") usage = 0x28; else if (token == "Escape" || token == "Esc") usage = 0x29; else if (token == "Backspace") usage = 0x2a; else if (token == "Tab") usage = 0x2b; else if (token == "Space") usage = 0x2c; else if (token == "ArrowRight") usage = 0x4f; else if (token == "ArrowLeft") usage = 0x50; else if (token == "ArrowDown") usage = 0x51; else if (token == "ArrowUp") usage = 0x52; else if (token.size() == 1 && token[0] >= 'A' && token[0] <= 'Z') usage = static_cast<uint8_t>(0x04 + token[0] - 'A'); else if (token.size() == 1 && token[0] >= '1' && token[0] <= '9') usage = static_cast<uint8_t>(0x1e + token[0] - '1'); else if (token == "0") usage = 0x27; else if (token.size() >= 2 && token[0] == 'F') { int f = 0; if (!integer_value(std::string_view(token).substr(1), f) || f < 1 || f > 24) return false; usage = static_cast<uint8_t>(0x3a + f - 1); } else return false; if (end == std::string::npos) break; begin = end + 1; } if (!usage) return false; action = {ConfigActionKind::Hotkey, modifiers, usage}; return true; }
bool action(std::string_view value, ConfigAction& out) {
  out = {};
  std::string parsed; size_t pos = 0; skip_ws(value, pos);
  if (pos < value.size() && value[pos] == '"') {
    if (!string_value(value, parsed)) return false;
    const auto& s = parsed;
    if (s == "disabled") out.kind = ConfigActionKind::Disabled;
    else if (s == "voice_ptt_hold") out = {ConfigActionKind::VoiceInput, 0x03, 0x2c};
    else if (s == "edit_ptt_hold") out = {ConfigActionKind::VoiceEdit, 0x03, 0x08};
    else if (s == "select_all") out = {ConfigActionKind::SelectAll, 1, 0x04};
    else if (s == "copy") out = {ConfigActionKind::Copy, 1, 0x06};
    else if (s == "paste") out = {ConfigActionKind::Paste, 1, 0x19};
    else if (s == "undo") out = {ConfigActionKind::Undo, 1, 0x1d};
    else if (s == "scroll_axis_toggle") out.kind = ConfigActionKind::EncoderAxisToggle;
    else if (s == "text_caret_select") out.kind = ConfigActionKind::TextCaretSelect;
    else if (s.rfind("host_action:", 0) == 0) {
      const std::string_view uuid{s.data() + 12, s.size() - 12};
      if (!is_canonical_host_action_uuid(uuid)) return false;
      out.kind = ConfigActionKind::HostAction;
      out.value.assign(uuid);
    } else out.kind = ConfigActionKind::Unsupported;
    return true;
  }
  std::optional<std::string_view> text, hotkey;
  if (!field_value(value, "text", text) || !field_value(value, "hotkey", hotkey)) return false;
  if (text.has_value()) {
    if (hotkey.has_value() || !string_value(*text, parsed) || !is_valid_fixed_text(parsed)) return false;
    out.kind = ConfigActionKind::FixedText;
    out.value = parsed;
    return true;
  }
  if (!hotkey.has_value() || !string_value(*hotkey, parsed)) return false;
  return parse_hotkey(parsed, out);
}
bool projection_from_json(std::string_view raw, ConfigProjection& out) {
  if (raw.empty() || raw.size() > kConfigMaxJsonBytes || !valid_json(raw)) return false;
  std::optional<std::string_view> schema, profiles, profile, keys, encoder, field; std::string parsed;
  if (!field_value(raw, "schema", schema) || !schema || !string_value(*schema, parsed) || parsed != "ai_keyboard.v1" ||
      !field_value(raw, "profiles", profiles) || !profiles || !first_array_value(*profiles, profile) || !profile ||
      !field_value(*profile, "keys", keys) || !keys || !field_value(*profile, "encoder", encoder) || !encoder) return false;
  ConfigProjection projection{};
  for (size_t i = 0; i < projection.keys.size(); ++i) {
    const char name[] = {'K','E','Y',static_cast<char>('1' + i),'\0'}; std::optional<std::string_view> binding, press;
    if (!field_value(*keys, name, binding) || !binding || !field_value(*binding, "press", press) || !press || !action(*press, projection.keys[i])) return false;
  }
  if (!field_value(*encoder, "press", field) || !field || !action(*field, projection.encoder_press)) return false;
  std::optional<std::string_view> scroll; if (!field_value(*encoder, "scroll", scroll)) return false;
  if (scroll) {
    if (!field_value(*scroll, "enabled", field)) return false;
    if (field && !boolean_value(*field, projection.encoder_enabled)) return false;
    if (!field_value(*scroll, "mode", field)) return false;
    if (field) {
      if (!string_value(*field, parsed) ||
          (parsed != "scroll" && parsed != "cursor")) return false;
      projection.encoder_cursor = parsed == "cursor";
    }
    if (!field_value(*scroll, "axis", field)) return false;
    if (field) {
      if (!string_value(*field, parsed) ||
          (parsed != "vertical" && parsed != "horizontal")) return false;
      projection.encoder_horizontal = parsed == "horizontal";
    }
    if (!field_value(*scroll, "speed", field)) return false;
    if (field) {
      int speed = 0;
      if (!integer_value(*field, speed) || speed < 1 || speed > 5) return false;
      projection.encoder_speed = static_cast<uint8_t>(speed);
    }
    for (const auto& item : {std::pair{"windows_reverse_vertical", &projection.reverse_vertical}, std::pair{"windows_reverse_horizontal", &projection.reverse_horizontal}}) { if (!field_value(*scroll, item.first, field)) return false; if (field && !boolean_value(*field, *item.second)) return false; }
  }
  if (projection.encoder_press.kind == ConfigActionKind::TextCaretSelect && !projection.encoder_cursor) return false;
  out = std::move(projection); return true;
}
}

uint16_t config_crc16_ccitt(const uint8_t* data, size_t length) { uint16_t crc = 0xffff; for (size_t i = 0; i < length; ++i) { crc ^= static_cast<uint16_t>(data[i]) << 8; for (int bit = 0; bit < 8; ++bit) crc = (crc & 0x8000) ? static_cast<uint16_t>((crc << 1) ^ 0x1021) : static_cast<uint16_t>(crc << 1); } return crc; }
ConfigReceiveStatus ConfigWriteAssembler::accept(const uint8_t* p, size_t n, uint32_t epoch) { if (!p || !epoch || n < 11 || n > kConfigWriteFeaturePayloadBytes || p[0] != 'S' || p[1] != '3' || p[2] != 'C' || p[3] != 1) return ConfigReceiveStatus::Rejected; const uint8_t index = p[4], total = p[5], chunk = p[8]; const uint16_t length = u16(p + 6), crc = u16(p + 9); if (!total || total > 40 || !length || length > kConfigMaxJsonBytes || !chunk || chunk > kConfigWriteChunkBytes || index >= total || 11u + chunk > n || (n > 11u + chunk && std::any_of(p + 11 + chunk, p + n, [](uint8_t v) { return v != 0; }))) { abort(); return ConfigReceiveStatus::Rejected; } if (index == 0) { abort(); active_ = true; epoch_ = epoch; total_chunks_ = total; declared_length_ = length; declared_crc_ = crc; } if (!active_ || epoch != epoch_ || index != expected_chunk_ || total != total_chunks_ || length != declared_length_ || crc != declared_crc_ || static_cast<size_t>(index) * kConfigWriteChunkBytes + chunk > length) { abort(); return ConfigReceiveStatus::Rejected; } std::copy_n(p + 11, chunk, document_.bytes.begin() + index * kConfigWriteChunkBytes); ++expected_chunk_; if (expected_chunk_ != total_chunks_) return ConfigReceiveStatus::Accepted; document_.length = length; document_.crc16 = crc; const bool good = static_cast<size_t>(total - 1) * kConfigWriteChunkBytes + chunk == length && config_crc16_ccitt(document_.bytes.data(), length) == crc; active_ = false; return good ? ConfigReceiveStatus::Complete : ConfigReceiveStatus::Rejected; }
void ConfigWriteAssembler::abort() { document_ = {}; epoch_ = 0; expected_chunk_ = total_chunks_ = 0; declared_length_ = declared_crc_ = 0; active_ = false; }
bool decode_config_read_request(const uint8_t* p, size_t n, ConfigReadRequest& out) { if (!p || n != kConfigReadRequestPayloadBytes || p[0] != 'S' || p[1] != '3' || p[2] != 'R' || p[3] != 1 || p[8] > 2) return false; const auto id = u32(p + 4); if (!id || std::any_of(p + 9, p + n, [](uint8_t v) { return v != 0; })) return false; out.request_id = id; out.flag = static_cast<ConfigReadFlag>(p[8]); return true; }
bool normalize_config_feature_report(uint8_t report_id, const uint8_t* buffer, size_t length, ConfigFeatureReportView& out) {
  out = {};
  if (!buffer) return false;
  const uint8_t* payload = buffer;
  size_t payload_length = length;
  if (payload_length != 0 && (payload[0] == 0x10 || payload[0] == 0x13)) {
    if (report_id != 0 && report_id != payload[0]) return false;
    report_id = payload[0];
    ++payload;
    --payload_length;
  }
  if (report_id == 0x10) {
    if (payload_length != kConfigWriteFeaturePayloadBytes) return false;
  } else if (report_id == 0x13) {
    if (payload_length < kConfigReadRequestPayloadBytes || payload_length > kConfigFeaturePayloadBytes ||
        std::any_of(payload + kConfigReadRequestPayloadBytes, payload + payload_length,
                    [](uint8_t value) { return value != 0; })) return false;
  } else return false;
  out = {report_id, payload, payload_length};
  return true;
}
bool ConfigReadStream::replace(uint32_t id, const ConfigDocument& d, uint32_t epoch) { abort(); if (!id || !epoch || !d.length || d.length > kConfigMaxJsonBytes || config_crc16_ccitt(d.bytes.data(), d.length) != d.crc16) return false; document_ = d; request_id_ = id; epoch_ = epoch; total_chunks_ = static_cast<uint8_t>((d.length + kConfigReadChunkBytes - 1) / kConfigReadChunkBytes); pending_ = true; return true; }
bool ConfigReadStream::encode_next(std::array<uint8_t, kConfigFeaturePayloadBytes>& out) const { if (!pending_ || next_chunk_ >= total_chunks_) return false; out.fill(0); const auto offset = static_cast<size_t>(next_chunk_) * kConfigReadChunkBytes; const auto count = std::min(kConfigReadChunkBytes, static_cast<size_t>(document_.length) - offset); out[0] = 6; out[1] = next_chunk_; out[2] = total_chunks_; out[3] = static_cast<uint8_t>(10 + count); out[4] = 1; w32(out.data() + 5, request_id_); w16(out.data() + 9, document_.length); w16(out.data() + 11, document_.crc16); out[13] = static_cast<uint8_t>(document_.source); std::copy_n(document_.bytes.data() + offset, count, out.begin() + 14); return true; }
bool ConfigReadStream::mark_sent() { if (!pending_) return false; if (++next_chunk_ >= total_chunks_) pending_ = false; return !pending_; }
void ConfigReadStream::abort() { document_ = {}; request_id_ = epoch_ = 0; next_chunk_ = total_chunks_ = 0; pending_ = false; }
bool ConfigStatusStream::replace(uint32_t id, uint32_t epoch,
                                 const LinkStatusSnapshot& link,
                                 const AgentStateDiagnostics& agent,
                                 const AudioCaptureDiagnostics& audio,
                                 const SpeakerOutputDiagnostics& speaker,
                                 const ManualCalibrationBridgeDiagnostics& manual) {
  abort();
  if (!id || !epoch) return false;
  const int written = std::snprintf(
      json_.data(), json_.size(),
      R"({"schema":"ai_keyboard.config_status.v1","capabilities":{"config_read_v1":true,"config_write_v1":true,"host_action_v1":true,"fixed_text_v1":true,"deskmate_link_v1":true,"agent_state_bridge_v1":true,"manual_calibration_bridge_v1":true,"audio_capture_v1":true,"speaker_output_v1":true},"link":{"state":"%s","rx_frames":%lu,"tx_frames":%lu,"framing_errors":%lu,"crc_errors":%lu,"version_errors":%lu,"length_errors":%lu,"request_timeouts":%lu,"retries":%lu,"queue_drops":%lu,"peer_restarts":%lu,"unexpected_frames":%lu,"semantic_errors":%lu},"agent_state":{"accepted":%lu,"malformed":%lu,"duplicates":%lu,"expired":%lu,"dropped_disconnected":%lu,"forwarded":%lu,"queue_drops":%lu},"manual_calibration":{"accepted":%lu,"terminal":%lu,"malformed":%lu,"duplicates":%lu,"busy":%lu,"stale":%lu,"conflicts":%lu,"lifecycle_clears":%lu,"response_drops":%lu},"audio_capture":{"state":"%s","captured_frames":%lu,"sent_frames":%lu,"dropped_frames":%lu,"read_errors":%lu,"send_errors":%lu,"recoveries":%lu},"speaker_output":{"state":"%s","requests":%lu,"completed":%lu,"cancelled_for_microphone":%lu,"busy_rejections":%lu,"init_errors":%lu,"write_errors":%lu,"cleanup_errors":%lu}})",
      link_controller_state_name(link.state),
      static_cast<unsigned long>(link.rx_frames),
      static_cast<unsigned long>(link.tx_frames),
      static_cast<unsigned long>(link.framing_errors),
      static_cast<unsigned long>(link.crc_errors),
      static_cast<unsigned long>(link.version_errors),
      static_cast<unsigned long>(link.length_errors),
      static_cast<unsigned long>(link.request_timeouts),
      static_cast<unsigned long>(link.retries),
      static_cast<unsigned long>(link.queue_drops),
      static_cast<unsigned long>(link.peer_restarts),
      static_cast<unsigned long>(link.unexpected_frames),
      static_cast<unsigned long>(link.semantic_errors),
      static_cast<unsigned long>(agent.accepted),
      static_cast<unsigned long>(agent.malformed),
      static_cast<unsigned long>(agent.duplicates),
      static_cast<unsigned long>(agent.expired),
      static_cast<unsigned long>(agent.dropped_disconnected),
      static_cast<unsigned long>(agent.forwarded),
      static_cast<unsigned long>(agent.queue_drops),
      static_cast<unsigned long>(manual.accepted),
      static_cast<unsigned long>(manual.terminal),
      static_cast<unsigned long>(manual.malformed),
      static_cast<unsigned long>(manual.duplicates),
      static_cast<unsigned long>(manual.busy),
      static_cast<unsigned long>(manual.stale),
      static_cast<unsigned long>(manual.conflicts),
      static_cast<unsigned long>(manual.lifecycle_clears),
      static_cast<unsigned long>(manual.response_drops),
      audio_capture_state_name(audio.state),
      static_cast<unsigned long>(audio.captured_frames),
      static_cast<unsigned long>(audio.sent_frames),
      static_cast<unsigned long>(audio.dropped_frames),
      static_cast<unsigned long>(audio.read_errors),
      static_cast<unsigned long>(audio.send_errors),
      static_cast<unsigned long>(audio.recoveries),
      speaker_output_state_name(speaker.state),
      static_cast<unsigned long>(speaker.requests),
      static_cast<unsigned long>(speaker.completed),
      static_cast<unsigned long>(speaker.cancelled_for_microphone),
      static_cast<unsigned long>(speaker.busy_rejections),
      static_cast<unsigned long>(speaker.init_errors),
      static_cast<unsigned long>(speaker.write_errors),
      static_cast<unsigned long>(speaker.cleanup_errors));
  if (written <= 0 || static_cast<size_t>(written) >= json_.size()) {
    abort();
    return false;
  }
  request_id_ = id;
  epoch_ = epoch;
  length_ = static_cast<uint16_t>(written);
  crc16_ = config_crc16_ccitt(
      reinterpret_cast<const uint8_t*>(json_.data()), length_);
  constexpr size_t kStatusChunkBytes = 50;
  total_chunks_ = static_cast<uint8_t>(
      (length_ + kStatusChunkBytes - 1) / kStatusChunkBytes);
  pending_ = true;
  return true;
}
bool ConfigStatusStream::encode_next(
    std::array<uint8_t, kConfigFeaturePayloadBytes>& out) const {
  if (!pending_ || next_chunk_ >= total_chunks_) return false;
  constexpr size_t kStatusChunkBytes = 50;
  out.fill(0);
  const size_t offset = static_cast<size_t>(next_chunk_) * kStatusChunkBytes;
  const size_t count =
      std::min(kStatusChunkBytes, static_cast<size_t>(length_) - offset);
  out[0] = 0x04;
  out[1] = next_chunk_;
  out[2] = total_chunks_;
  out[3] = static_cast<uint8_t>(9 + count);
  out[4] = 1;
  w32(out.data() + 5, request_id_);
  w16(out.data() + 9, length_);
  w16(out.data() + 11, crc16_);
  std::copy_n(reinterpret_cast<const uint8_t*>(json_.data()) + offset,
              count, out.begin() + 13);
  return true;
}
bool ConfigStatusStream::mark_sent() {
  if (!pending_) return false;
  if (++next_chunk_ >= total_chunks_) pending_ = false;
  return !pending_;
}
void ConfigStatusStream::abort() {
  json_.fill(0);
  request_id_ = epoch_ = 0;
  next_chunk_ = total_chunks_ = 0;
  length_ = crc16_ = 0;
  pending_ = false;
}
bool parse_config_projection(std::string_view raw, ConfigProjection& out) { return projection_from_json(raw, out); }
AudioConfigProjectionStatus parse_audio_capture_config(
    std::string_view raw, AudioCaptureConfig& out) {
  out = {};
  if (raw.empty() || raw.size() > kConfigMaxJsonBytes || !valid_json(raw)) {
    return AudioConfigProjectionStatus::Invalid;
  }
  std::optional<std::string_view> ssid, password, host, port;
  if (!field_value(raw, "wifi_ssid", ssid) ||
      !field_value(raw, "wifi_password", password) ||
      !field_value(raw, "audio_host", host) ||
      !field_value(raw, "audio_port", port)) {
    return AudioConfigProjectionStatus::Invalid;
  }
  if (!ssid || !password || !host || !port) {
    return AudioConfigProjectionStatus::ConfigIncomplete;
  }
  std::string parsed_ssid, parsed_password, parsed_host;
  int parsed_port = 0;
  if (!string_value(*ssid, parsed_ssid) ||
      !string_value(*password, parsed_password) ||
      !string_value(*host, parsed_host) ||
      !integer_value(*port, parsed_port)) {
    return AudioConfigProjectionStatus::Invalid;
  }
  const auto safe_text = [](const std::string& value) {
    return std::none_of(value.begin(), value.end(), [](unsigned char c) {
      return c == 0 || c < 0x20 || c == 0x7f;
    });
  };
  const auto safe_host = [](const std::string& value) {
    return !value.empty() &&
           std::all_of(value.begin(), value.end(), [](unsigned char c) {
             return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
                    (c >= '0' && c <= '9') || c == '.' || c == '-';
           });
  };
  if (parsed_ssid.empty() || parsed_ssid.size() >= out.wifi_ssid.size() ||
      parsed_password.size() >= out.wifi_password.size() ||
      parsed_host.size() >= out.audio_host.size() ||
      !safe_text(parsed_ssid) || !safe_text(parsed_password) ||
      !safe_host(parsed_host) || parsed_port < 1 || parsed_port > 65535) {
    return AudioConfigProjectionStatus::Invalid;
  }
  std::copy(parsed_ssid.begin(), parsed_ssid.end(), out.wifi_ssid.begin());
  std::copy(parsed_password.begin(), parsed_password.end(),
            out.wifi_password.begin());
  std::copy(parsed_host.begin(), parsed_host.end(), out.audio_host.begin());
  out.audio_port = static_cast<uint16_t>(parsed_port);
  return AudioConfigProjectionStatus::Ready;
}
const char* compiled_safe_config_json() { return R"({"schema":"ai_keyboard.v1","target_platform":"windows","profiles":[{"id":"default","keys":{"KEY1":{"press":"voice_ptt_hold"},"KEY2":{"press":{"hotkey":"Return"}},"KEY3":{"press":"edit_ptt_hold"},"KEY4":{"press":{"hotkey":"Backspace"}},"KEY5":{"press":"select_all"},"KEY6":{"press":"copy"},"KEY7":{"press":"paste"},"KEY8":{"press":"undo"}},"encoder":{"left":"disabled","right":"disabled","press":"scroll_axis_toggle","scroll":{"enabled":true,"mode":"scroll","axis":"vertical","speed":3,"windows_reverse_vertical":false,"windows_reverse_horizontal":false}}}]})"; }
bool validate_config_record(const ConfigSlotRecord& r) { ConfigProjection p{}; return r.magic == kConfigRecordMagic && r.version == kConfigRecordVersion && r.length && r.length <= kConfigMaxJsonBytes && config_crc16_ccitt(r.bytes.data(), r.length) == r.crc16 && parse_config_projection({reinterpret_cast<const char*>(r.bytes.data()), r.length}, p); }
void select_config_record(const ConfigSlotRecord* a, const ConfigSlotRecord* b, ConfigSlot marker, ConfigLoadResult& result) { result.document.bytes.fill(0); result.document.length=0; result.document.crc16=0; result.document.source=ConfigSource::Default; result.slot=ConfigSlot::Invalid; result.generation=0; result.recovered_marker=false; const bool va = a && validate_config_record(*a), vb = b && validate_config_record(*b); const ConfigSlotRecord* selected = nullptr; ConfigSlot slot = ConfigSlot::Invalid; if (marker == ConfigSlot::A && va) { selected = a; slot = ConfigSlot::A; } else if (marker == ConfigSlot::B && vb) { selected = b; slot = ConfigSlot::B; } else if (va || vb) { if (va && (!vb || a->generation >= b->generation)) { selected = a; slot = ConfigSlot::A; } else { selected = b; slot = ConfigSlot::B; } } result.slot = slot; result.recovered_marker = marker == ConfigSlot::Invalid ? (va || vb) : ((marker == ConfigSlot::A && !va) || (marker == ConfigSlot::B && !vb)); if (selected) { result.document.length = selected->length; result.document.crc16 = selected->crc16; result.document.source = result.recovered_marker ? ConfigSource::Recovery : ConfigSource::DeskMate; result.generation = selected->generation; std::copy_n(selected->bytes.begin(), selected->length, result.document.bytes.begin()); } }
ConfigSaveStatus save_config_transaction(ConfigStorageBackend& backend, const ConfigDocument& d, ConfigSlot active, uint32_t generation, ConfigTransactionWorkspace& workspace) { ConfigProjection p{}; if (generation == std::numeric_limits<uint32_t>::max() || !parse_config_projection(d.view(), p) || config_crc16_ccitt(d.bytes.data(), d.length) != d.crc16) return ConfigSaveStatus::WriteFailed; const ConfigSlot incoming = active == ConfigSlot::A ? ConfigSlot::B : ConfigSlot::A; workspace.record.bytes.fill(0); workspace.record.magic=kConfigRecordMagic; workspace.record.version=kConfigRecordVersion; workspace.record.length=d.length; workspace.record.generation=generation+1; workspace.record.crc16=d.crc16; std::copy_n(d.bytes.begin(), d.length, workspace.record.bytes.begin()); if (!backend.write_slot(incoming, workspace.record)) return ConfigSaveStatus::WriteFailed; if (!backend.commit()) return ConfigSaveStatus::CommitFailed; workspace.readback.bytes.fill(0); workspace.readback.magic=kConfigRecordMagic; workspace.readback.version=kConfigRecordVersion; workspace.readback.length=0; workspace.readback.generation=0; workspace.readback.crc16=0; if (!backend.read_slot(incoming, workspace.readback) || std::memcmp(&workspace.record, &workspace.readback, sizeof(workspace.record)) != 0 || !validate_config_record(workspace.readback)) return ConfigSaveStatus::ReadbackFailed; if (!backend.write_marker(incoming) || !backend.commit()) return ConfigSaveStatus::MarkerFailed; return ConfigSaveStatus::Saved; }
}  // namespace deskmate::easyinput
