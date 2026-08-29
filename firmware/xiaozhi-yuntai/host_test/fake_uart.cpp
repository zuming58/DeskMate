#include "fake_uart.h"

#include <algorithm>

namespace deskmate::xiaozhi::test {

bool FakeUartTransport::IsOpen() const noexcept {
    return open_;
}

std::size_t FakeUartTransport::Receive(std::uint8_t* destination, std::size_t capacity) {
    if (!open_ || destination == nullptr || capacity == 0) {
        return 0;
    }

    const auto count = std::min(capacity, received_.size());
    for (std::size_t index = 0; index < count; ++index) {
        destination[index] = received_.front();
        received_.pop_front();
    }
    return count;
}

std::size_t FakeUartTransport::Send(const std::uint8_t* source, std::size_t size) {
    if (!open_ || source == nullptr || size == 0) {
        return 0;
    }

    sent_.insert(sent_.end(), source, source + size);
    return size;
}

void FakeUartTransport::SetOpen(bool open) noexcept {
    open_ = open;
}

void FakeUartTransport::FeedReceive(const std::vector<std::uint8_t>& bytes) {
    received_.insert(received_.end(), bytes.begin(), bytes.end());
}

std::vector<std::uint8_t> FakeUartTransport::TakeSent() {
    auto bytes = sent_;
    sent_.clear();
    return bytes;
}

}  // namespace deskmate::xiaozhi::test
