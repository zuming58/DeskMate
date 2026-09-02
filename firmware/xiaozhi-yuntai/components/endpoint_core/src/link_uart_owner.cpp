#include "link_uart_owner.h"

#include <limits>

namespace deskmate::xiaozhi {
namespace {

void AddSaturated(std::uint32_t& value, std::size_t amount) noexcept {
    const auto remaining = std::numeric_limits<std::uint32_t>::max() - value;
    value += static_cast<std::uint32_t>(amount > remaining ? remaining : amount);
}

void IncrementSaturated(std::uint32_t& value) noexcept {
    AddSaturated(value, 1);
}

}  // namespace

LinkUartOwner::LinkUartOwner(Transport& transport,
                             XiaozhiLinkEndpoint& endpoint) noexcept
    : transport_(transport), endpoint_(endpoint) {}

void LinkUartOwner::Service(std::uint32_t now_ms) noexcept {
    parser_.Expire(now_ms);
    if (!transport_.IsOpen()) {
        if (transport_was_open_) {
            endpoint_.OnLinkDisconnected();
            IncrementSaturated(diagnostics_.disconnects);
        }
        transport_was_open_ = false;
        return;
    }
    transport_was_open_ = true;
    endpoint_.Tick(now_ms);

    for (std::size_t read_index = 0; read_index < kMaxReadsPerService;
         ++read_index) {
        const auto result =
            transport_.Receive(read_buffer_.data(), read_buffer_.size());
        if (result.status == TransportReadStatus::kIdle) {
            break;
        }
        if (result.status == TransportReadStatus::kOverflow) {
            parser_.NoteTransportOverflow();
            IncrementSaturated(diagnostics_.rx_overflows);
            continue;
        }
        if (result.status == TransportReadStatus::kError ||
            result.size > read_buffer_.size()) {
            IncrementSaturated(diagnostics_.transport_errors);
            endpoint_.OnLinkDisconnected();
            break;
        }
        if (result.status != TransportReadStatus::kData || result.size == 0) {
            continue;
        }

        AddSaturated(diagnostics_.rx_bytes, result.size);
        for (std::size_t byte_index = 0; byte_index < result.size; ++byte_index) {
            LinkFrame request{};
            if (!parser_.Push(read_buffer_[byte_index], now_ms, request)) {
                continue;
            }
            LinkWireFrame response{};
            if (!endpoint_.Handle(request, now_ms, response)) {
                continue;
            }
            const auto written =
                transport_.Send(response.bytes.data(), response.length);
            AddSaturated(diagnostics_.tx_bytes, written);
            if (written != response.length) {
                IncrementSaturated(diagnostics_.short_writes);
                endpoint_.OnLinkDisconnected();
            }
        }
    }
}

}  // namespace deskmate::xiaozhi
