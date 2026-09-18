# Pydee engine — native build.
#
# Links against the Skia static libraries produced by
# engine/scripts/bootstrap-skia.sh at the commit pinned in engine/skia.revision.
# Skia lives OUTSIDE this repository: our sources are never vendored into a
# third-party checkout, so Skia stays independently upgradable.
#
# Flags match how Skia itself was compiled (-fno-exceptions -fno-rtti, C++20).
# Mismatching those against a library built without them invites subtle ODR and
# ABI problems.
#
# Usage:
#   cmake -S engine -B engine/build -G Ninja -DCMAKE_BUILD_TYPE=Release
#   cmake --build engine/build
#   ./engine/build/pydee_engine_tests

cmake_minimum_required(VERSION 3.22)

# Build with the same compiler Skia was built with. Skia's static libraries are
# compiled with clang; linking them from g++ can work on Linux but mixes two
# C++ toolchains across a large static boundary, which is an avoidable class of
# ABI and ODR problems. Override with -DCMAKE_CXX_COMPILER=... if needed.
if(NOT DEFINED CMAKE_CXX_COMPILER)
  find_program(PYDEE_CLANGXX clang++)
  if(PYDEE_CLANGXX)
    set(CMAKE_CXX_COMPILER "${PYDEE_CLANGXX}" CACHE FILEPATH "C++ compiler" FORCE)
  endif()
endif()

project(pydee_engine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "" FORCE)
endif()

set(SKIA_DIR "$ENV{HOME}/dev/skia" CACHE PATH "Root of the pinned Skia checkout")

# Native and WASM link against different Skia build outputs. The WASM output is
# produced by Skia's own CanvasKit build, which is the known-good reference
# configuration for the Emscripten toolchain.
if(EMSCRIPTEN)
  set(SKIA_OUT "${SKIA_DIR}/out/canvaskit_wasm" CACHE PATH "Skia wasm build output")
else()
  set(SKIA_OUT "${SKIA_DIR}/out/native-release" CACHE PATH "Skia native build output")
endif()

if(NOT EXISTS "${SKIA_OUT}/libskia.a")
  message(FATAL_ERROR
    "libskia.a not found at ${SKIA_OUT}.\n"
    "Run: bash engine/scripts/bootstrap-skia.sh")
endif()

# Verify the checkout matches the recorded pin, so a silent Skia drift cannot
# produce a build that differs from the one the tests were written against.
set(_revision_file "${CMAKE_CURRENT_SOURCE_DIR}/skia.revision")
if(EXISTS "${_revision_file}")
  file(READ "${_revision_file}" _pinned_revision)
  string(STRIP "${_pinned_revision}" _pinned_revision)
  execute_process(
    COMMAND git -C "${SKIA_DIR}" rev-parse HEAD
    OUTPUT_VARIABLE _actual_revision
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_QUIET)
  if(_actual_revision AND NOT _actual_revision STREQUAL _pinned_revision)
    message(WARNING
      "Skia checkout is at ${_actual_revision} but engine/skia.revision pins "
      "${_pinned_revision}. Re-run engine/scripts/bootstrap-skia.sh.")
  endif()
endif()

add_library(pydee_engine STATIC
  src/font_registry.cpp
  src/geometry.cpp
  src/gesture.cpp
  src/paint_servers.cpp
  src/raster_target.cpp
  src/scene_codec.cpp
  src/scene_renderer.cpp
  src/selection.cpp
  src/shape_geometry.cpp
  src/skia_renderer.cpp
)

target_include_directories(pydee_engine
  PUBLIC  include
  PRIVATE src "${SKIA_DIR}"
)

target_compile_options(pydee_engine PRIVATE
  -fno-exceptions
  -fno-rtti
  -fvisibility=hidden
  -Wall
  -Wextra
)

if(EMSCRIPTEN)
  # Skia's CanvasKit build sets is_trivial_abi=true, which marks sk_sp with
  # [[clang::trivial_abi]] and changes how it is returned from a function (in a
  # register rather than through a hidden pointer). Compiling our translation
  # units without the same define produces a wasm-ld "function signature
  # mismatch" and undefined behaviour at the call site, so it must match exactly.
  target_compile_definitions(pydee_engine PRIVATE "SK_TRIVIAL_ABI=[[clang::trivial_abi]]")
endif()

# Skia's static libraries are mutually dependent, so they must be resolved as a
# group rather than in a single pass. Globbing keeps this correct as the enabled
# module set changes instead of hardcoding a list that silently rots.
file(GLOB SKIA_STATIC_LIBS "${SKIA_OUT}/*.a")
list(LENGTH SKIA_STATIC_LIBS _skia_lib_count)
message(STATUS "Linking ${_skia_lib_count} Skia static libraries from ${SKIA_OUT}")

if(EMSCRIPTEN)
  # WASM target: our own bindings, exposing the Pydee scene API. CanvasKit's
  # JavaScript API is deliberately not re-exported.
  add_executable(pydee_engine_wasm wasm/bindings.cpp)

  target_include_directories(pydee_engine_wasm PRIVATE include src "${SKIA_DIR}")
  target_compile_definitions(pydee_engine_wasm PRIVATE "SK_TRIVIAL_ABI=[[clang::trivial_abi]]")
  # RTTI is enabled ONLY for this file. embind's type identifiers must match the
  # prebuilt libembind in the Emscripten sysroot, which is compiled with RTTI;
  # with -fno-rtti every argument type is reported as unbound at runtime. This
  # translation unit includes no Skia header (the surface is behind
  # pydee::RasterTarget), so the RTTI difference cannot reach Skia's vtables.
  target_compile_options(pydee_engine_wasm PRIVATE
    -fno-exceptions
    -frtti
    -Oz
    -Wall
    -Wextra
  )

  # -sMODULARIZE with a named factory keeps the module out of global scope so it
  # can be lazy-loaded by the editor instead of inflating the initial bundle.
  # EXPORT_ES6 emits a real ES module, which both the browser (via dynamic
  # import) and Node can load without a script-tag shim.
  # ALLOW_MEMORY_GROWTH is required because document size is unbounded.
  # No pthreads on purpose: that would require SharedArrayBuffer and therefore
  # COOP/COEP headers on the host page.
  target_link_options(pydee_engine_wasm PRIVATE
    -Oz
    --bind
    -sMODULARIZE=1
    -sEXPORT_NAME=createPydeeEngine
    -sEXPORT_ES6=1
    -sENVIRONMENT=web,worker,node
    -sALLOW_MEMORY_GROWTH=1
    -sFILESYSTEM=0
    -sASSERTIONS=0
  )

  target_link_libraries(pydee_engine_wasm PRIVATE
    pydee_engine
    ${SKIA_STATIC_LIBS}
  )

  set_target_properties(pydee_engine_wasm PROPERTIES OUTPUT_NAME "pydee-engine" SUFFIX ".mjs")
else()
  add_executable(pydee_engine_tests
    tests/test_engine.cpp
  )

  target_include_directories(pydee_engine_tests PRIVATE include src "${SKIA_DIR}")
  target_compile_options(pydee_engine_tests PRIVATE -fno-exceptions -fno-rtti -Wall -Wextra)
  target_link_libraries(pydee_engine_tests PRIVATE
    pydee_engine
    -Wl,--start-group ${SKIA_STATIC_LIBS} -Wl,--end-group
    pthread
    dl
  )

  enable_testing()
  add_test(NAME pydee_engine_tests COMMAND pydee_engine_tests)
endif()
