// This Source Code Form is subject to the terms of the Mozilla
// Public License, v. 2.0. If a copy of the MPL was not distributed
// with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

// This is a modification of http://stackoverflow.com/a/11368019/68333
#include <stdio.h>
#include <dirent.h>
#include <string.h>
#include <X11/Xlib.h>

int main(void) {
  DIR* directory = opendir("/tmp/.X11-unix");

  if (directory != NULL) {
    struct dirent *entry;
    while ((entry = readdir(directory)) != NULL) {
      if (entry->d_name[0] != 'X') {
        continue;
      }

      char name[256];
      name[0] = ':';
      strcpy(name + 1, entry->d_name + 1);
      Display *display = XOpenDisplay(name);
      if (display != NULL) {
        int n = XScreenCount(display);
        int i;
        for (i = 0; i < n; i++) {
          int width = XDisplayWidth(display, i);
          int height = XDisplayHeight(display, i);
          printf("%s.%d\t%dx%d\n", name, i, width, height);
        }
      }
      XCloseDisplay(display);
    }
    closedir(directory);
  }

  return 0;
}

