#include "fake_uart.h"

#include <algorithm>

namespace deskmate::xiaozhi::test {

bool FakeUartTransport::IsOpen() const noexcept {
    return open_;
}

TransportReadResult FakeUartTransport::Receive(std::uint8_t* destination,
                                               std::size_t capacity) {
    if (!open_ || destination == nullptr || capacity == 0) {
        return {TransportReadStatus::kIdle, 0};
    }
    if (overflow_) {
        overflow_ = false;
        return {TransportReadStatus::kOverflow, 0};
    }
    if (error_) {
        error_ = false;
        return {TransportReadStatus::kError, 0};
    }

    const auto count = std::min(capacity, received_.size());
    for (std::size_t index = 0; index < count; ++index) {
        destination[index] = received_.front();
        received_.pop_front();
    }
    return {count == 0 ? TransportReadStatus::kIdle
                       : TransportReadStatus::kData,
            count};
}

std::size_t FakeUartTransport::Send(const std::uint8_t* source, std::size_t size) {
    if (!open_ || source == nullptr || size == 0) {
        return 0;
    }

    const auto count = std::min(size, send_limit_);
    sent_.insert(sent_.end(), source, source + count);
    return count;
}

void FakeUartTransport::SetOpen(bool open) noexcept {
    open_ = open;
}

void FakeUartTransport::FeedReceive(const std::vector<std::uint8_t>& bytes) {
    received_.insert(received_.end(), bytes.begin(), bytes.end());
}

void FakeUartTransport::SignalOverflow() noexcept {
    overflow_ = true;
    received_.clear();
}

void FakeUartTransport::SignalError() noexcept {
    error_ = true;
}

void FakeUartTransport::SetSendLimit(std::size_t limit) noexcept {
    send_limit_ = limit;
}

std::vector<std::uint8_t> FakeUartTransport::TakeSent() {
    auto bytes = sent_;
    sent_.clear();
    return bytes;
}

}  // namespace deskmate::xiaozhi::test
