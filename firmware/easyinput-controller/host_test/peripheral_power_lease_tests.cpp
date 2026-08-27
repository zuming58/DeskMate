#include "peripheral_power_lease.h"

#include <iostream>

using deskmate::easyinput::PeripheralPowerLeaseSet;
using deskmate::easyinput::PeripheralPowerOwner;

namespace {
int failures = 0;

void check(bool passed, const char* expression, int line) {
    if (passed) return;
    std::cerr << __FILE__ << ':' << line << ": CHECK failed: " << expression << '\n';
    ++failures;
}

#define CHECK(expression) check((expression), #expression, __LINE__)

void owners_are_independent() {
    PeripheralPowerLeaseSet leases;
    CHECK(!leases.power_required());
    CHECK(leases.acquire(PeripheralPowerOwner::Led));
    CHECK(leases.acquire(PeripheralPowerOwner::KeyboardMic));
    CHECK(leases.acquire(PeripheralPowerOwner::Speaker));
    CHECK(leases.held_mask() == 0b0111);
    CHECK(!leases.acquire(PeripheralPowerOwner::Led));

    CHECK(leases.release(PeripheralPowerOwner::Led));
    CHECK(leases.power_required());
    CHECK(!leases.release(PeripheralPowerOwner::Led));
    CHECK(leases.held(PeripheralPowerOwner::KeyboardMic));
    CHECK(leases.held(PeripheralPowerOwner::Speaker));
}

void device_awake_keeps_the_rail_required() {
    PeripheralPowerLeaseSet leases;
    CHECK(leases.acquire(PeripheralPowerOwner::DeviceAwake));
    CHECK(leases.acquire(PeripheralPowerOwner::Led));
    CHECK(leases.release(PeripheralPowerOwner::Led));
    CHECK(leases.held(PeripheralPowerOwner::DeviceAwake));
    CHECK(leases.power_required());
    leases.clear();
    CHECK(!leases.power_required());
}

void invalid_owner_fails_closed() {
    PeripheralPowerLeaseSet leases;
    const auto invalid = static_cast<PeripheralPowerOwner>(99);
    CHECK(!leases.acquire(invalid));
    CHECK(!leases.release(invalid));
    CHECK(!leases.held(invalid));
    CHECK(!leases.power_required());
}
}  // namespace

int main() {
    owners_are_independent();
    device_awake_keeps_the_rail_required();
    invalid_owner_fails_closed();
    if (failures != 0) {
        std::cerr << "peripheral_power_lease_tests: " << failures << " failure(s)\n";
        return 1;
    }
    std::cout << "peripheral_power_lease_tests: PASS\n";
    return 0;
}
