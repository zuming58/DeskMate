#include "config_core.h"
#include "host_action_core.h"

#include <algorithm>
#include <cstdint>
#include <cstring>
#include <limits>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace deskmate::easyinput {
namespace {
uint16_t u16(const uint8_t* p) { return static_cast<uint16_t>(p[0] | (p[1] << 8)); }
uint32_t u32(const uint8_t* p) { return p[0] | (p[1] << 8u) | (p[2] << 16u) | (p[3] << 24u); }
void w16(uint8_t* p, uint16_t v) { p[0] = static_cast<uint8_t>(v); p[1] = static_cast<uint8_t>(v >> 8); }
void w32(uint8_t* p, uint32_t v) { for (unsigned i = 0; i < 4; ++i) p[i] = static_cast<uint8_t>(v >> (8u * i)); }

struct JsonValue {
  enum class Kind : uint8_t { Object, Array, String, Number, Boolean, Null } kind{Kind::Null};
  std::string string;
  std::string number;
  bool boolean{false};
  std::vector<std::pair<std::string, JsonValue>> object;
  std::vector<JsonValue> array;
  const JsonValue* member(std::string_view name) const { for (const auto& item : object) if (item.first == name) return &item.second; return nullptr; }
};

bool hex(char c, uint8_t& out) { if (c >= '0' && c <= '9') { out = static_cast<uint8_t>(c - '0'); return true; } if (c >= 'a' && c <= 'f') { out = static_cast<uint8_t>(c - 'a' + 10); return true; } if (c >= 'A' && c <= 'F') { out = static_cast<uint8_t>(c - 'A' + 10); return true; } return false; }
bool append_utf8(uint32_t cp, std::string& out) { if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return false; if (cp <= 0x7f) out.push_back(static_cast<char>(cp)); else if (cp <= 0x7ff) { out.push_back(static_cast<char>(0xc0 | (cp >> 6))); out.push_back(static_cast<char>(0x80 | (cp & 0x3f))); } else if (cp <= 0xffff) { out.push_back(static_cast<char>(0xe0 | (cp >> 12))); out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3f))); out.push_back(static_cast<char>(0x80 | (cp & 0x3f))); } else { out.push_back(static_cast<char>(0xf0 | (cp >> 18))); out.push_back(static_cast<char>(0x80 | ((cp >> 12) & 0x3f))); out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3f))); out.push_back(static_cast<char>(0x80 | (cp & 0x3f))); } return true; }

class JsonParser {
 public:
  explicit JsonParser(std::string_view input) : input_(input) {}
  bool parse(JsonValue& out) { if (!value(out, 0)) return false; ws(); return pos_ == input_.size(); }
 private:
  std::string_view input_; size_t pos_{0};
  void ws() { while (pos_ < input_.size() && (input_[pos_] == ' ' || input_[pos_] == '\n' || input_[pos_] == '\r' || input_[pos_] == '\t')) ++pos_; }
  bool string(std::string& out) {
    if (pos_ >= input_.size() || input_[pos_++] != '"') return false;
    out.clear();
    while (pos_ < input_.size()) { const uint8_t c = static_cast<uint8_t>(input_[pos_++]); if (c == '"') return true; if (c < 0x20) return false; if (c == '\\') { if (pos_ >= input_.size()) return false; const char e = input_[pos_++]; if (e == '"' || e == '\\' || e == '/') out.push_back(e); else if (e == 'b') out.push_back('\b'); else if (e == 'f') out.push_back('\f'); else if (e == 'n') out.push_back('\n'); else if (e == 'r') out.push_back('\r'); else if (e == 't') out.push_back('\t'); else if (e == 'u') { if (pos_ + 4 > input_.size()) return false; uint16_t first = 0; uint8_t d = 0; for (int i = 0; i < 4; ++i) { if (!hex(input_[pos_ + i], d)) return false; first = static_cast<uint16_t>((first << 4) | d); } pos_ += 4; uint32_t cp = first; if (first >= 0xd800 && first <= 0xdbff) { if (pos_ + 6 > input_.size() || input_[pos_] != '\\' || input_[pos_ + 1] != 'u') return false; pos_ += 2; uint16_t second = 0; for (int i = 0; i < 4; ++i) { if (!hex(input_[pos_ + i], d)) return false; second = static_cast<uint16_t>((second << 4) | d); } pos_ += 4; if (second < 0xdc00 || second > 0xdfff) return false; cp = 0x10000u + ((static_cast<uint32_t>(first) - 0xd800u) << 10) + second - 0xdc00u; } else if (first >= 0xdc00 && first <= 0xdfff) return false; if (!append_utf8(cp, out)) return false; } else return false; continue; }
      if (c <= 0x7f) { out.push_back(static_cast<char>(c)); continue; }
      const size_t count = c >= 0xc2 && c <= 0xdf ? 2 : c >= 0xe0 && c <= 0xef ? 3 : c >= 0xf0 && c <= 0xf4 ? 4 : 0; if (!count || pos_ + count - 1 > input_.size()) return false; const uint8_t second = static_cast<uint8_t>(input_[pos_]); if ((c == 0xe0 && second < 0xa0) || (c == 0xed && second > 0x9f) || (c == 0xf0 && second < 0x90) || (c == 0xf4 && second > 0x8f)) return false; for (size_t i = 0; i < count - 1; ++i) if ((static_cast<uint8_t>(input_[pos_ + i]) & 0xc0) != 0x80) return false; out.append(input_.data() + pos_ - 1, count); pos_ += count - 1;
    } return false;
  }
  bool value(JsonValue& out, unsigned depth) {
    if (depth > 16) return false;
    ws();
    if (pos_ >= input_.size()) return false;
    if (input_[pos_] == '{') { ++pos_; out = {}; out.kind = JsonValue::Kind::Object; ws(); if (pos_ < input_.size() && input_[pos_] == '}') { ++pos_; return true; } while (true) { std::string key; ws(); if (!string(key)) return false; if (out.member(key)) return false; ws(); if (pos_ >= input_.size() || input_[pos_++] != ':') return false; JsonValue v; if (!value(v, depth + 1)) return false; out.object.emplace_back(std::move(key), std::move(v)); ws(); if (pos_ >= input_.size()) return false; if (input_[pos_] == '}') { ++pos_; return true; } if (input_[pos_++] != ',') return false; } }
    if (input_[pos_] == '[') { ++pos_; out = {}; out.kind = JsonValue::Kind::Array; ws(); if (pos_ < input_.size() && input_[pos_] == ']') { ++pos_; return true; } while (true) { JsonValue v; if (!value(v, depth + 1)) return false; out.array.push_back(std::move(v)); ws(); if (pos_ >= input_.size()) return false; if (input_[pos_] == ']') { ++pos_; return true; } if (input_[pos_++] != ',') return false; } }
    if (input_[pos_] == '"') { out = {}; out.kind = JsonValue::Kind::String; return string(out.string); }
    if (input_.substr(pos_, 4) == "true") { pos_ += 4; out = {}; out.kind = JsonValue::Kind::Boolean; out.boolean = true; return true; }
    if (input_.substr(pos_, 5) == "false") { pos_ += 5; out = {}; out.kind = JsonValue::Kind::Boolean; return true; }
    if (input_.substr(pos_, 4) == "null") { pos_ += 4; out = {}; return true; }
    const size_t begin = pos_; if (input_[pos_] == '-') ++pos_; if (pos_ >= input_.size()) return false; if (input_[pos_] == '0') ++pos_; else { if (input_[pos_] < '1' || input_[pos_] > '9') return false; while (pos_ < input_.size() && input_[pos_] >= '0' && input_[pos_] <= '9') ++pos_; } if (pos_ < input_.size() && input_[pos_] == '.') { ++pos_; if (pos_ >= input_.size() || input_[pos_] < '0' || input_[pos_] > '9') return false; while (pos_ < input_.size() && input_[pos_] >= '0' && input_[pos_] <= '9') ++pos_; } if (pos_ < input_.size() && (input_[pos_] == 'e' || input_[pos_] == 'E')) { ++pos_; if (pos_ < input_.size() && (input_[pos_] == '+' || input_[pos_] == '-')) ++pos_; if (pos_ >= input_.size() || input_[pos_] < '0' || input_[pos_] > '9') return false; while (pos_ < input_.size() && input_[pos_] >= '0' && input_[pos_] <= '9') ++pos_; } out = {}; out.kind = JsonValue::Kind::Number; out.number = std::string(input_.substr(begin, pos_ - begin)); return true;
  }
};

bool integer(const JsonValue& v, int& out) { if (v.kind != JsonValue::Kind::Number || v.number.empty() || v.number.find_first_of(".eE") != std::string::npos) return false; size_t i = 0; bool neg = false; if (v.number[0] == '-') { neg = true; i = 1; } if (i == v.number.size()) return false; const uint64_t limit = neg ? 2147483648ULL : 2147483647ULL; uint64_t n = 0; for (; i < v.number.size(); ++i) { if (v.number[i] < '0' || v.number[i] > '9') return false; const uint64_t digit = static_cast<uint64_t>(v.number[i] - '0'); if (n > (limit - digit) / 10u) return false; n = n * 10u + digit; } out = neg ? (n == 2147483648ULL ? std::numeric_limits<int>::min() : -static_cast<int>(n)) : static_cast<int>(n); return true; }
bool string_value(const JsonValue* v, std::string_view expected, std::string* out = nullptr) { if (!v || v->kind != JsonValue::Kind::String || (!expected.empty() && v->string != expected)) return false; if (out) *out = v->string; return true; }
bool parse_hotkey(const std::string& value, ConfigAction& action) { if (value.empty() || value.size() > 64) return false; uint8_t modifiers = 0, usage = 0; size_t begin = 0; while (begin <= value.size()) { const size_t end = value.find('+', begin); const std::string token = value.substr(begin, end == std::string::npos ? end : end - begin); if (token == "Ctrl" || token == "Control") modifiers |= 1; else if (token == "Shift") modifiers |= 2; else if (token == "Alt" || token == "Option") modifiers |= 4; else if (token == "Meta" || token == "Command" || token == "Super") modifiers |= 8; else if (token == "Return" || token == "Enter") usage = 0x28; else if (token == "Escape" || token == "Esc") usage = 0x29; else if (token == "Backspace") usage = 0x2a; else if (token == "Tab") usage = 0x2b; else if (token == "Space") usage = 0x2c; else if (token == "ArrowRight") usage = 0x4f; else if (token == "ArrowLeft") usage = 0x50; else if (token == "ArrowDown") usage = 0x51; else if (token == "ArrowUp") usage = 0x52; else if (token.size() == 1 && token[0] >= 'A' && token[0] <= 'Z') usage = static_cast<uint8_t>(0x04 + token[0] - 'A'); else if (token.size() == 1 && token[0] >= '1' && token[0] <= '9') usage = static_cast<uint8_t>(0x1e + token[0] - '1'); else if (token == "0") usage = 0x27; else if (token.size() >= 2 && token[0] == 'F') { JsonValue n{}; n.kind = JsonValue::Kind::Number; n.number = token.substr(1); int f = 0; if (!integer(n, f) || f < 1 || f > 24) return false; usage = static_cast<uint8_t>(0x3a + f - 1); } else return false; if (end == std::string::npos) break; begin = end + 1; } if (!usage) return false; action = {ConfigActionKind::Hotkey, modifiers, usage}; return true; }
bool action(const JsonValue* value, ConfigAction& out) {
  if (!value) return false;
  out = {};
  if (value->kind == JsonValue::Kind::String) {
    const auto& s = value->string;
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
  if (value->kind != JsonValue::Kind::Object) return false;
  if (const JsonValue* text = value->member("text")) {
    if (value->object.size() != 1 || text->kind != JsonValue::Kind::String ||
        !is_valid_fixed_text(text->string)) return false;
    out.kind = ConfigActionKind::FixedText;
    out.value = text->string;
    return true;
  }
  std::string hotkey;
  if (value->object.size() != 1 ||
      !string_value(value->member("hotkey"), {}, &hotkey)) return false;
  return parse_hotkey(hotkey, out);
}
bool projection_from_json(std::string_view raw, ConfigProjection& out) { if (raw.empty() || raw.size() > kConfigMaxJsonBytes) return false; JsonValue root; if (!JsonParser(raw).parse(root) || root.kind != JsonValue::Kind::Object || !string_value(root.member("schema"), "ai_keyboard.v1")) return false; const JsonValue* profiles = root.member("profiles"); if (!profiles || profiles->kind != JsonValue::Kind::Array || profiles->array.empty() || profiles->array[0].kind != JsonValue::Kind::Object) return false; const JsonValue& profile = profiles->array[0]; const JsonValue* keys = profile.member("keys"); const JsonValue* encoder = profile.member("encoder"); if (!keys || keys->kind != JsonValue::Kind::Object || !encoder || encoder->kind != JsonValue::Kind::Object) return false; ConfigProjection p{}; for (size_t i = 0; i < p.keys.size(); ++i) { const JsonValue* binding = keys->member("KEY" + std::to_string(i + 1)); if (!binding || binding->kind != JsonValue::Kind::Object || !action(binding->member("press"), p.keys[i])) return false; } if (!action(encoder->member("press"), p.encoder_press)) return false; const JsonValue* scroll = encoder->member("scroll"); if (scroll) { if (scroll->kind != JsonValue::Kind::Object) return false; if (const auto* enabled = scroll->member("enabled")) { if (enabled->kind != JsonValue::Kind::Boolean) return false; p.encoder_enabled = enabled->boolean; } if (const auto* mode = scroll->member("mode")) { if (mode->kind != JsonValue::Kind::String || (mode->string != "scroll" && mode->string != "cursor")) return false; p.encoder_cursor = mode->string == "cursor"; } if (const auto* axis = scroll->member("axis")) { if (axis->kind != JsonValue::Kind::String || (axis->string != "vertical" && axis->string != "horizontal")) return false; p.encoder_horizontal = axis->string == "horizontal"; } if (const auto* speed = scroll->member("speed")) { int n = 0; if (!integer(*speed, n) || n < 1 || n > 5) return false; p.encoder_speed = static_cast<uint8_t>(n); } for (const auto& item : {std::pair{"windows_reverse_vertical", &p.reverse_vertical}, std::pair{"windows_reverse_horizontal", &p.reverse_horizontal}}) { if (const auto* v = scroll->member(item.first)) { if (v->kind != JsonValue::Kind::Boolean) return false; *item.second = v->boolean; } } } if (p.encoder_press.kind == ConfigActionKind::TextCaretSelect && !p.encoder_cursor) return false; out = p; return true; }
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
namespace { constexpr char kConfigStatusJson[] = R"({"schema":"ai_keyboard.config_status.v1","capabilities":{"config_read_v1":true,"config_write_v1":true,"host_action_v1":true,"fixed_text_v1":true}})"; }
bool ConfigStatusStream::replace(uint32_t id, uint32_t epoch) { abort(); if (!id || !epoch) return false; request_id_=id; epoch_=epoch; length_=static_cast<uint16_t>(sizeof(kConfigStatusJson)-1); crc16_=config_crc16_ccitt(reinterpret_cast<const uint8_t*>(kConfigStatusJson),length_); total_chunks_=static_cast<uint8_t>((length_+49)/50); pending_=true; return true; }
bool ConfigStatusStream::encode_next(std::array<uint8_t,kConfigFeaturePayloadBytes>& out) const { if(!pending_||next_chunk_>=total_chunks_)return false; out.fill(0); const size_t offset=static_cast<size_t>(next_chunk_)*50; const size_t count=std::min<size_t>(50,length_-offset); out[0]=0x04; out[1]=next_chunk_; out[2]=total_chunks_; out[3]=static_cast<uint8_t>(9+count); out[4]=1; w32(out.data()+5,request_id_); w16(out.data()+9,length_); w16(out.data()+11,crc16_); std::copy_n(reinterpret_cast<const uint8_t*>(kConfigStatusJson)+offset,count,out.begin()+13); return true; }
bool ConfigStatusStream::mark_sent(){if(!pending_)return false;if(++next_chunk_>=total_chunks_)pending_=false;return !pending_;}
void ConfigStatusStream::abort(){request_id_=epoch_=0;next_chunk_=total_chunks_=0;length_=crc16_=0;pending_=false;}
bool parse_config_projection(std::string_view raw, ConfigProjection& out) { return projection_from_json(raw, out); }
const char* compiled_safe_config_json() { return R"({"schema":"ai_keyboard.v1","target_platform":"windows","profiles":[{"id":"default","keys":{"KEY1":{"press":"voice_ptt_hold"},"KEY2":{"press":{"hotkey":"Return"}},"KEY3":{"press":"edit_ptt_hold"},"KEY4":{"press":{"hotkey":"Backspace"}},"KEY5":{"press":"select_all"},"KEY6":{"press":"copy"},"KEY7":{"press":"paste"},"KEY8":{"press":"undo"}},"encoder":{"left":"disabled","right":"disabled","press":"scroll_axis_toggle","scroll":{"enabled":true,"mode":"scroll","axis":"vertical","speed":3,"windows_reverse_vertical":false,"windows_reverse_horizontal":false}}}]})"; }
bool validate_config_record(const ConfigSlotRecord& r) { ConfigProjection p{}; return r.magic == kConfigRecordMagic && r.version == kConfigRecordVersion && r.length && r.length <= kConfigMaxJsonBytes && config_crc16_ccitt(r.bytes.data(), r.length) == r.crc16 && parse_config_projection({reinterpret_cast<const char*>(r.bytes.data()), r.length}, p); }
void select_config_record(const ConfigSlotRecord* a, const ConfigSlotRecord* b, ConfigSlot marker, ConfigLoadResult& result) { result.document.bytes.fill(0); result.document.length=0; result.document.crc16=0; result.document.source=ConfigSource::Default; result.slot=ConfigSlot::Invalid; result.generation=0; result.recovered_marker=false; const bool va = a && validate_config_record(*a), vb = b && validate_config_record(*b); const ConfigSlotRecord* selected = nullptr; ConfigSlot slot = ConfigSlot::Invalid; if (marker == ConfigSlot::A && va) { selected = a; slot = ConfigSlot::A; } else if (marker == ConfigSlot::B && vb) { selected = b; slot = ConfigSlot::B; } else if (va || vb) { if (va && (!vb || a->generation >= b->generation)) { selected = a; slot = ConfigSlot::A; } else { selected = b; slot = ConfigSlot::B; } } result.slot = slot; result.recovered_marker = marker == ConfigSlot::Invalid ? (va || vb) : ((marker == ConfigSlot::A && !va) || (marker == ConfigSlot::B && !vb)); if (selected) { result.document.length = selected->length; result.document.crc16 = selected->crc16; result.document.source = result.recovered_marker ? ConfigSource::Recovery : ConfigSource::DeskMate; result.generation = selected->generation; std::copy_n(selected->bytes.begin(), selected->length, result.document.bytes.begin()); } }
ConfigSaveStatus save_config_transaction(ConfigStorageBackend& backend, const ConfigDocument& d, ConfigSlot active, uint32_t generation, ConfigTransactionWorkspace& workspace) { ConfigProjection p{}; if (generation == std::numeric_limits<uint32_t>::max() || !parse_config_projection(d.view(), p) || config_crc16_ccitt(d.bytes.data(), d.length) != d.crc16) return ConfigSaveStatus::WriteFailed; const ConfigSlot incoming = active == ConfigSlot::A ? ConfigSlot::B : ConfigSlot::A; workspace.record.bytes.fill(0); workspace.record.magic=kConfigRecordMagic; workspace.record.version=kConfigRecordVersion; workspace.record.length=d.length; workspace.record.generation=generation+1; workspace.record.crc16=d.crc16; std::copy_n(d.bytes.begin(), d.length, workspace.record.bytes.begin()); if (!backend.write_slot(incoming, workspace.record)) return ConfigSaveStatus::WriteFailed; if (!backend.commit()) return ConfigSaveStatus::CommitFailed; workspace.readback.bytes.fill(0); workspace.readback.magic=kConfigRecordMagic; workspace.readback.version=kConfigRecordVersion; workspace.readback.length=0; workspace.readback.generation=0; workspace.readback.crc16=0; if (!backend.read_slot(incoming, workspace.readback) || std::memcmp(&workspace.record, &workspace.readback, sizeof(workspace.record)) != 0 || !validate_config_record(workspace.readback)) return ConfigSaveStatus::ReadbackFailed; if (!backend.write_marker(incoming) || !backend.commit()) return ConfigSaveStatus::MarkerFailed; return ConfigSaveStatus::Saved; }
}  // namespace deskmate::easyinput
